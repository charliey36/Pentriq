import { captureError } from '@/lib/monitoring';
import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { syncAllConnections } from '@/lib/google-review-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled job (daily in vercel.json because Vercel Hobby only allows daily crons;
 * call it every 6 hours from Vercel Pro or an external scheduler): synchronises Google reviews
 * for every connected business — fetches new/modified reviews, recalculates
 * statistics, stores the daily snapshot and raises alerts. Protected by
 * CRON_SECRET like the other scheduled endpoints (`?secret=` or
 * `Authorization: Bearer`; Vercel Cron sends the latter automatically).
 */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set.' }, { status: 500 });
  }

  if (!isCronAuthorized(request, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const results = await syncAllConnections();
    // Per-business failures are returned as data, not thrown, so report them explicitly.
    results.filter((r) => !r.ok).forEach((r) => captureError(r.error ?? 'Google review sync failed', { area: 'cron:sync-google-reviews', tags: { business_id: r.businessId } }));
    return NextResponse.json({
      businesses: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      inserted: results.reduce((n, r) => n + r.inserted, 0),
      updated: results.reduce((n, r) => n + r.updated, 0),
      alerts: results.reduce((n, r) => n + r.alerts, 0),
    });
  } catch (err) {
    captureError(err, { area: 'cron:sync-google-reviews' });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed.' }, { status: 500 });
  }
}
