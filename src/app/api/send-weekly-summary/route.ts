import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingState } from '@/lib/billing';
import { isPaused } from '@/lib/pause';
import { buildWeeklySummary, loadWeeklyStats } from '@/lib/weekly-summary';
import { sendOwnerEmail } from '@/lib/email';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SIX_DAYS_MS = 6 * 86_400_000;

/**
 * Mondays (see vercel.json): emails each active business owner a weekly
 * performance summary. Idempotent per week: `weekly_summary_sent_at` is claimed
 * (update ... where it is null or older than six days) before sending, so a
 * repeated cron run cannot double-send. Opt out via businesses.weekly_summary_enabled.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set.' }, { status: 500 });
  if (!isCronAuthorized(request, secret)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const db = createAdminClient();
  const { data: businesses, error } = await db.from('businesses').select('*').neq('weekly_summary_enabled', false).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  let sent = 0;
  let skipped = 0;
  for (const business of businesses ?? []) {
    try {
      const ownerEmail = (await db.auth.admin.getUserById(business.owner_id)).data.user?.email;
      const billing = getBillingState(business, now, ownerEmail ?? undefined);
      if (!ownerEmail || !billing.hasAccess || isPaused(business, now)) { skipped += 1; continue; }

      const last = business.weekly_summary_sent_at ? Date.parse(business.weekly_summary_sent_at) : 0;
      if (now.getTime() - last < SIX_DAYS_MS) { skipped += 1; continue; }
      // Claim the week before sending.
      const claimed = await db
        .from('businesses')
        .update({ weekly_summary_sent_at: now.toISOString() })
        .eq('id', business.id)
        .or(`weekly_summary_sent_at.is.null,weekly_summary_sent_at.lt.${new Date(now.getTime() - SIX_DAYS_MS).toISOString()}`)
        .select('id');
      if (!claimed.data?.length) { skipped += 1; continue; }

      const email = buildWeeklySummary(await loadWeeklyStats(db, business, now));
      await sendOwnerEmail(ownerEmail, email);
      sent += 1;
    } catch (err) {
      captureError(err, { area: 'cron:weekly-summary', tags: { business_id: business.id } });
    }
  }
  return NextResponse.json({ sent, skipped });
}
