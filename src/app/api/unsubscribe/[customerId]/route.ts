import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RATE_LIMITS, requesterId, withinLimit } from '@/lib/rate-limit';
import { unsubscribeCustomer } from '@/lib/unsubscribe';
import { isOneClickBody, renderUnsubscribePage, type UnsubscribeState } from '@/lib/unsubscribe-page';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = 'force-dynamic';

const STATUS: Record<UnsubscribeState, number> = { confirm: 200, done: 200, already: 200, invalid: 400, not_found: 404, rate_limited: 429 };

function page(state: UnsubscribeState, opts: { businessName?: string | null; actionPath?: string } = {}) {
  return new NextResponse(renderUnsubscribePage(state, opts), {
    status: STATUS[state],
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...(state === 'rate_limited' ? { 'retry-after': '600' } : {}),
    },
  });
}

/**
 * Public unsubscribe link from every email (UK PECR / CAN-SPAM opt-out). Runs with the admin client because the
 * visitor has no Pentriq session (same pattern as click tracking).
 *
 * GET only shows a confirmation page and never changes anything: email security scanners fetch every link in a
 * message, and when GET unsubscribed they silently opted real customers out.
 */
export async function GET(request: NextRequest, { params: paramsPromise }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await paramsPromise;
  if (!UUID.test(customerId)) return page('invalid');
  if (!(await withinLimit('unsubscribe-ip', requesterId(request.headers), RATE_LIMITS.unsubscribeIp))) return page('rate_limited');

  const db = createAdminClient();
  const { data: customer } = await db.from('customers').select('id, business_id, unsubscribed_at').eq('id', customerId).maybeSingle();
  if (!customer) return page('not_found');
  const { data: business } = await db.from('businesses').select('name').eq('id', customer.business_id).maybeSingle();
  if (customer.unsubscribed_at) return page('already', { businessName: business?.name });
  return page('confirm', { businessName: business?.name, actionPath: `/api/unsubscribe/${customerId}` });
}

/**
 * Performs the unsubscribe. Two callers:
 *  - mail clients doing RFC 8058 one-click (body `List-Unsubscribe=One-Click`, List-Unsubscribe-Post header in
 *    our emails): answered with a short plain-text body;
 *  - the confirmation form above: answered with the "you've been unsubscribed" page.
 */
export async function POST(request: NextRequest, { params: paramsPromise }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await paramsPromise;
  const body = await request.text().catch(() => '');
  const oneClick = isOneClickBody(body);
  if (!UUID.test(customerId)) return oneClick ? new NextResponse('Invalid unsubscribe link.', { status: 400 }) : page('invalid');
  if (!(await withinLimit('unsubscribe-ip', requesterId(request.headers), RATE_LIMITS.unsubscribeIp))) {
    return oneClick ? new NextResponse('Too many requests.', { status: 429, headers: { 'Retry-After': '600' } }) : page('rate_limited');
  }

  const db = createAdminClient();
  const outcome = await unsubscribeCustomer(db, customerId);
  if (oneClick) return new NextResponse(outcome === 'not_found' ? 'Not found.' : 'Unsubscribed.', { status: outcome === 'not_found' ? 404 : 200 });
  if (outcome === 'not_found') return page('not_found');

  const { data: customer } = await db.from('customers').select('business_id').eq('id', customerId).maybeSingle();
  const { data: business } = customer
    ? await db.from('businesses').select('name').eq('id', customer.business_id).maybeSingle()
    : { data: null };
  return page('done', { businessName: business?.name });
}
