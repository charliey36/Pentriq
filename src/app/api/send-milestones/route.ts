import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingState } from '@/lib/billing';
import { milestoneEmail, newlyReached, type MilestoneStats } from '@/lib/milestones';
import { REVIEW_PURPOSES } from '@/lib/click-analytics';
import { sendOwnerEmail } from '@/lib/email';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily: emails business owners (trial and paid) when they reach an activation
 * milestone: first import, first 20 requests, first review, first 10 reviews.
 * Each milestone is claimed atomically on `businesses.milestones_sent` before the
 * email goes out, so it is sent at most once.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set.' }, { status: 500 });
  if (!isCronAuthorized(request, secret)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const db = createAdminClient();
  const { data: businesses, error } = await db.from('businesses').select('*').limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const business of businesses ?? []) {
    try {
      const ownerEmail = (await db.auth.admin.getUserById(business.owner_id)).data.user?.email;
      if (!ownerEmail || !getBillingState(business, new Date(), ownerEmail).hasAccess) continue;

      const [customers, msgs, legacy, googleReviews, confirmed] = await Promise.all([
        db.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
        db.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', business.id).in('purpose', [...REVIEW_PURPOSES]).eq('status', 'sent'),
        db.from('review_requests').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'sent'),
        db.from('google_reviews').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('review_date', business.created_at.slice(0, 10)),
        db.from('interaction_events').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('event_type', 'review_confirmed'),
      ]);
      const stats: MilestoneStats = {
        customers: customers.count ?? 0,
        requestsSent: (msgs.count ?? 0) + (legacy.count ?? 0),
        reviews: (googleReviews.count ?? 0) + (confirmed.count ?? 0),
      };

      const sentMap = business.milestones_sent ?? {};
      const reached = newlyReached(stats, sentMap);
      if (reached.length === 0) continue;

      // Record every reached milestone, but only email the most advanced one.
      const stamp = new Date().toISOString();
      const next = { ...sentMap, ...Object.fromEntries(reached.map((k) => [k, stamp])) };
      const top = reached[reached.length - 1];
      const claimed = await db
        .from('businesses')
        .update({ milestones_sent: next })
        .eq('id', business.id)
        .filter(`milestones_sent->>${top}`, 'is', null)
        .select('id');
      if (!claimed.data?.length) continue;

      await sendOwnerEmail(ownerEmail, milestoneEmail(top, stats, business.name));
      sent += 1;
    } catch (err) {
      captureError(err, { area: 'cron:milestones', tags: { business_id: business.id } });
    }
  }
  return NextResponse.json({ sent });
}
