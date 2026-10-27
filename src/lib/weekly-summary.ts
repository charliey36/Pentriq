/**
 * Weekly performance summary emailed to business owners. `buildWeeklySummary`
 * is pure (numbers in, email out); `loadWeeklyStats` gathers the numbers.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { APP_NAME } from '@/lib/brand';
import { renderOwnerEmail } from '@/lib/email-templates/owner-email';
import { COUNTED_CLICK_TYPES, REVIEW_PURPOSES } from '@/lib/click-analytics';
import { loadReputation } from '@/lib/reputation-data';
import { reviewsGainedBetween } from '@/lib/reputation-metrics';
import { addDays, statsAsOf } from '@/lib/google-review-analytics';
import type { createAdminClient } from '@/lib/supabase/admin';

export type WeeklyStats = {
  businessName: string;
  reviewsGained: number | null;
  previousReviewsGained: number | null;
  totalReviews: number | null;
  averageRating: number | null;
  requestsSent: number;
  /** Customers who followed the review link this week. */
  clickedThrough: number;
  topPlatform: string;
};

export const conversionRate = (clicked: number, sent: number): number | null =>
  sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : null;

export function platformFromUrl(url: string | null | undefined): string {
  const u = (url ?? '').toLowerCase();
  if (/google\.|g\.page|goo\.gl/.test(u)) return 'Google Reviews';
  if (u.includes('trustpilot')) return 'Trustpilot';
  if (u.includes('facebook') || u.includes('fb.com')) return 'Facebook';
  if (u.includes('yelp')) return 'Yelp';
  return 'Your review page';
}

export function growthLine(gained: number | null, previous: number | null): string {
  if (gained === null) return 'Connect Google or add your review numbers to see weekly growth.';
  if (gained === 0) return "No new reviews this week yet. Reminders are working in the background, so give it a few more days.";
  if (previous === null || previous === 0) return `You gained ${gained} new review${gained === 1 ? '' : 's'} this week. A great start to build on.`;
  const pct = Math.round(((gained - previous) / previous) * 100);
  if (pct > 0) return `Up ${pct}% on last week: ${gained} new review${gained === 1 ? '' : 's'} vs ${previous}. Momentum is building.`;
  if (pct === 0) return `A steady week: ${gained} new review${gained === 1 ? '' : 's'}, same as last week.`;
  return `${gained} new review${gained === 1 ? '' : 's'} this week (${previous} last week). Consistency wins: keep requests flowing.`;
}

export function buildWeeklySummary(s: WeeklyStats): { subject: string; html: string; text: string } {
  const conv = conversionRate(s.clickedThrough, s.requestsSent);
  const gainedText = s.reviewsGained === null ? '—' : `+${s.reviewsGained}`;
  const subject =
    s.reviewsGained && s.reviewsGained > 0
      ? `${s.businessName}: ${s.reviewsGained} new review${s.reviewsGained === 1 ? '' : 's'} this week`
      : `${s.businessName}: your weekly ${APP_NAME} summary`;
  const roi =
    s.requestsSent > 0
      ? `${APP_NAME} sent ${s.requestsSent} review request${s.requestsSent === 1 ? '' : 's'} for you this week and ${s.clickedThrough} customer${s.clickedThrough === 1 ? '' : 's'} went on to your review page. That is outreach you did not have to do by hand.`
      : `No review requests went out this week. Import your latest jobs and ${APP_NAME} will handle the follow-up automatically.`;
  const { html, text } = renderOwnerEmail({
    preheader: growthLine(s.reviewsGained, s.previousReviewsGained),
    eyebrow: 'Your week in reviews',
    heading: s.reviewsGained && s.reviewsGained > 0 ? 'Nice work, your reputation is growing' : 'Your weekly summary',
    intro: [growthLine(s.reviewsGained, s.previousReviewsGained)],
    stats: [
      { label: 'Reviews gained', value: gainedText, hint: 'this week' },
      { label: 'Total reviews', value: s.totalReviews === null ? '—' : String(s.totalReviews) },
      { label: 'Average rating', value: s.averageRating === null ? '—' : s.averageRating.toFixed(1) },
      { label: 'Requests sent', value: String(s.requestsSent) },
      { label: 'Conversion rate', value: conv === null ? '—' : `${conv}%`, hint: 'clicked through' },
      { label: 'Top platform', value: s.topPlatform },
    ],
    highlight: roi,
    cta: { label: 'Open your dashboard', path: '/dashboard' },
    footnote: 'You can turn this weekly email off in Settings.',
  });
  return { subject, html, text };
}

type Admin = ReturnType<typeof createAdminClient>;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Gathers one business's numbers for the 7 days ending `now`. */
export async function loadWeeklyStats(
  db: Admin,
  business: Pick<Database['public']['Tables']['businesses']['Row'], 'id' | 'name' | 'google_review_url'>,
  now = new Date()
): Promise<WeeklyStats> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const today = iso(now);
  const weekStart = addDays(today, -6);

  const [msgs, legacy, clicks, rep] = await Promise.all([
    db.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', business.id).in('purpose', [...REVIEW_PURPOSES]).eq('status', 'sent').gte('sent_at', since),
    db.from('review_requests').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'sent').gte('sent_at', since),
    db.from('interaction_events').select('customer_id, message_id').eq('business_id', business.id).in('event_type', [...COUNTED_CLICK_TYPES]).gte('occurred_at', since).limit(1000),
    loadReputation(db, business.id, true),
  ]);

  const snaps = rep.snapshots;
  const hasData = snaps.length > 0;
  const unique = new Set((clicks.data ?? []).map((c) => c.customer_id ?? c.message_id).filter(Boolean));
  return {
    businessName: business.name,
    reviewsGained: hasData ? reviewsGainedBetween(snaps, weekStart, today) : null,
    previousReviewsGained: hasData ? reviewsGainedBetween(snaps, addDays(weekStart, -7), addDays(weekStart, -1)) : null,
    totalReviews: hasData ? statsAsOf(snaps, [], today).total : null,
    averageRating: hasData ? statsAsOf(snaps, [], today).average : null,
    requestsSent: (msgs.count ?? 0) + (legacy.count ?? 0),
    clickedThrough: unique.size,
    topPlatform: platformFromUrl(business.google_review_url),
  };
}
