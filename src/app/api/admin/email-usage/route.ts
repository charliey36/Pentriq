import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-guard';
import { getUsageSummary } from '@/lib/resend-usage-service';

export const dynamic = 'force-dynamic';

/** Admin-only JSON snapshot of Resend usage (the Resend key stays on the server). */
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const result = await getUsageSummary();
  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
}
