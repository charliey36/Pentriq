import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncBookingConnection } from '@/lib/booking-sync/sync';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily (before the review-request sender): pulls newly finished appointments from every connected
 * booking system. One bad connection never stops the others; connections whose access was revoked
 * are flagged "needs reconnect" and skipped until the owner reconnects.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set.' }, { status: 500 });
  if (!isCronAuthorized(request, secret)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: connections, error } = await admin.from('booking_connections').select('*').eq('status', 'active').limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totals = { connections: 0, ok: 0, reconnect: 0, error: 0, visits: 0 };
  for (const conn of connections ?? []) {
    totals.connections += 1;
    try {
      const outcome = await syncBookingConnection(admin, conn);
      totals[outcome.status] += 1;
      totals.visits += outcome.visitsAdded;
    } catch (e) {
      totals.error += 1;
      captureError(e, { area: 'cron:sync-bookings', tags: { connection_id: conn.id, provider: conn.provider } });
    }
  }
  return NextResponse.json(totals);
}
