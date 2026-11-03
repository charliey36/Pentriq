import { NextResponse, type NextRequest } from 'next/server';
import { requireCapability } from '@/lib/business-access';
import { createClient } from '@/lib/supabase/server';
import { collectCustomerData } from '@/lib/customer-privacy';
import { recordAudit } from '@/lib/audit';
import { withinLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/customers/{id}/export: everything held about one customer, as JSON, for answering a subject access
 * request. Owners and admins only; read with the signed-in user's client so row-level security scopes it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const { business, userId, email } = await requireCapability('data.export');
  if (!UUID.test(customerId)) return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  if (!(await withinLimit('customer-export', business.id, { limit: 60, windowSeconds: 3600 }))) {
    return NextResponse.json({ error: 'Too many exports. Please try again later.' }, { status: 429 });
  }

  const data = await collectCustomerData(createClient(), business.id, customerId);
  if (!data) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });

  await recordAudit({ action: 'customer.exported', businessId: business.id, actorId: userId, actorEmail: email, targetType: 'customer', targetId: customerId });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="customer-${customerId}.json"`,
      'cache-control': 'no-store',
    },
  });
}
