/**
 * Server-side loader for Pentriq Intelligence. One call gathers every signal the health score, next best
 * actions, feedback triage, review themes and forecasts need, in a single parallel batch, and is memoised per
 * request so the layout, dashboard and insights page can all ask for it without repeating queries.
 *
 * Reads use the signed-in user's client (row-level security scopes them to the business) except reputation
 * snapshots and the Google connection, which, like the Reviews page, are read with the service role.
 */
import { cache } from 'react';
import type { Business } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicConnection } from '@/lib/google-connection';
import { loadReputation } from '@/lib/reputation-data';
import { computeReputation, reviewsGainedBetween } from '@/lib/reputation-metrics';
import { addDays, dateKey } from '@/lib/google-review-analytics';
import { REVIEW_PURPOSES, getClickTimestamps } from '@/lib/click-analytics';
import { fetchAll } from '@/lib/fetch-all';
import { computeRebookingRate } from '@/lib/health';
import { bucketDaily } from '@/lib/trends';
import { getBillingState } from '@/lib/billing';
import { computeCustomerMetrics, loadSegmentInputs } from '@/lib/segments';
import { computeBusinessHealth, type HealthInput, type HealthReport } from '@/lib/intelligence/business-health';
import { computeNextActions, type BusinessSignals, type NextAction } from '@/lib/intelligence/next-best-actions';
import { inboxStats, summariseTopics, triageFeedback, type InboxStats, type TopicSummary, type Triage } from '@/lib/intelligence/feedback-triage';
import { analyseReviewThemes, type ThemeReport } from '@/lib/intelligence/review-themes';
import { forecastCounts, nextMilestone, projectMilestone, type CountForecast, type MilestoneProjection } from '@/lib/intelligence/forecast';

const DAY_MS = 86_400_000;
const SERIES_DAYS = 30;
const ROW_CAP = 5000;

export type TriagedFeedback = {
  id: string;
  rating: number | null;
  comment: string;
  status: 'new' | 'acknowledged' | 'resolved';
  created_at: string;
  customer_id: string | null;
  triage: Triage;
};

export type IntelligenceSnapshot = {
  generatedAt: string;
  health: HealthReport;
  healthInput: HealthInput;
  actions: NextAction[];
  signals: BusinessSignals;
  feedback: { items: TriagedFeedback[]; topics: TopicSummary[]; stats: InboxStats };
  reputation: {
    source: 'google' | 'manual';
    hasData: boolean;
    averageRating: number | null;
    totalReviews: number;
    gainedThisMonth: number;
    gainedLastMonth: number;
    reviewsGained30d: number | null;
    milestone: MilestoneProjection | null;
  };
  googleActive: boolean;
  themes: ThemeReport | null;
  retention: {
    rebookingRatePct: number | null;
    customersWithVisits: number;
    due: number;
    lapsed: number;
    onTrack: number;
    lapsedLifetimeValue: number;
    averageVisitValue: number | null;
  };
  series: { labels: string[]; requests: number[]; clicks: number[] };
  forecast: { requests: CountForecast; clicks: CountForecast };
  totals: { customers: number; requests30d: number; clicks30d: number };
};

async function safe<T, F = T>(promise: PromiseLike<T>, fallback: F): Promise<T | F> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

const headCount = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

async function build(business: Business, now: Date): Promise<IntelligenceSnapshot> {
  const supabase = createClient();
  const admin = createAdminClient();
  const since30 = new Date(now.getTime() - SERIES_DAYS * DAY_MS);
  since30.setUTCHours(0, 0, 0, 0);
  const since90 = new Date(now.getTime() - 90 * DAY_MS).toISOString();
  const since365 = new Date(now.getTime() - 365 * DAY_MS).toISOString();
  const id = business.id;

  const connection = await safe(getPublicConnection(id), null);
  const googleActive = connection?.status === 'active' && Boolean(connection.google_location_id);

  const [
    customers,
    segmentInputs,
    sentMessages,
    sentLegacy,
    clickTimes,
    openFeedback,
    recentFeedback,
    googleReviews,
    reputation,
    requestedMessageCustomers,
    requestedLegacyCustomers,
    held,
    failedMessages,
    failedLegacy,
    unreadAlerts,
  ] = await Promise.all([
    safe(headCount(supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', id).is('archived_at', null)), 0),
    safe(loadSegmentInputs(supabase, id), { customers: [], visits: [], tags: [], services: [] }),
    safe(
      supabase.from('messages').select('sent_at').eq('business_id', id).in('purpose', [...REVIEW_PURPOSES]).eq('status', 'sent').gte('sent_at', since30.toISOString()).order('sent_at', { ascending: false }).limit(ROW_CAP),
      { data: [] as Array<{ sent_at: string | null }> }
    ),
    safe(
      supabase.from('review_requests').select('sent_at').eq('business_id', id).eq('status', 'sent').gte('sent_at', since30.toISOString()).order('sent_at', { ascending: false }).limit(ROW_CAP),
      { data: [] as Array<{ sent_at: string | null }> }
    ),
    safe(getClickTimestamps(supabase, id, since30.toISOString(), ROW_CAP), [] as string[]),
    safe(
      supabase.from('private_feedback').select('id, rating, comment, status, created_at, customer_id').eq('business_id', id).eq('status', 'new').order('created_at', { ascending: false }).limit(500),
      { data: [] }
    ),
    safe(
      supabase.from('private_feedback').select('id, rating, comment, status, created_at, customer_id').eq('business_id', id).gte('created_at', since90).order('created_at', { ascending: false }).limit(500),
      { data: [] }
    ),
    googleActive
      ? safe(
          supabase.from('google_reviews').select('rating, comment, review_date, reply_text').eq('business_id', id).gte('review_date', since365).order('review_date', { ascending: false }).limit(1000),
          { data: [] }
        )
      : Promise.resolve({ data: [] as Array<{ rating: number; comment: string | null; review_date: string; reply_text: string | null }> }),
    safe(loadReputation(admin, id, googleActive), { source: 'manual' as const, snapshots: [] }),
    safe(fetchAll((from, to) => supabase.from('messages').select('customer_id').eq('business_id', id).in('purpose', [...REVIEW_PURPOSES]).order('id').range(from, to)), [] as Array<{ customer_id: string }>),
    safe(fetchAll((from, to) => supabase.from('review_requests').select('customer_id').eq('business_id', id).order('id').range(from, to)), [] as Array<{ customer_id: string }>),
    safe(headCount(supabase.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('purpose', 'review_request').eq('status', 'queued')), 0),
    safe(headCount(supabase.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', id).in('purpose', [...REVIEW_PURPOSES]).eq('status', 'failed').gte('created_at', since90)), 0),
    safe(headCount(supabase.from('review_requests').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('status', 'failed')), 0),
    safe(headCount(supabase.from('review_alerts').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('is_read', false)), 0),
  ]);

  // ---- Feedback triage ----
  type FeedbackRow = Omit<TriagedFeedback, 'triage'>;
  const feedbackById = new Map<string, FeedbackRow>();
  for (const row of [...((openFeedback.data ?? []) as FeedbackRow[]), ...((recentFeedback.data ?? []) as FeedbackRow[])]) feedbackById.set(row.id, row);
  const triaged: TriagedFeedback[] = [...feedbackById.values()].map((row) => ({
    ...row,
    status: row.status as TriagedFeedback['status'],
    triage: triageFeedback({ rating: row.rating, comment: row.comment, createdAt: row.created_at, status: row.status as TriagedFeedback['status'] }, now),
  }));
  const feedbackStatsInput = triaged.map((t) => ({ ...t.triage, status: t.status }));
  const stats = inboxStats(feedbackStatsInput);
  const recentTriaged = triaged.filter((t) => t.created_at >= since90);

  // ---- Retention ----
  const metrics = computeCustomerMetrics(segmentInputs, now.getTime());
  const withVisits = metrics.filter((m) => m.visitCount > 0);
  const due = metrics.filter((m) => m.rebooking === 'due');
  const lapsed = metrics.filter((m) => m.rebooking === 'lapsed');
  const onTrack = metrics.filter((m) => m.rebooking === 'on_track');
  const lapsedLifetimeValue = lapsed.reduce((s, m) => s + m.lifetimeValue, 0);
  const prices = segmentInputs.visits.map((v) => v.price).filter((p): p is number => typeof p === 'number' && p > 0);
  const averageVisitValue = prices.length ? Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100 : null;
  const rebooking = computeRebookingRate(segmentInputs.visits.map((v) => ({ customer_id: v.customer_id, visited_at: v.visited_at })));
  const withInterval = metrics.filter((m) => m.rebooking !== 'unknown').length;
  const lapsedSharePct = withInterval > 0 ? Math.round((lapsed.length / withInterval) * 1000) / 10 : null;
  const servicesWithInterval = (segmentInputs.services ?? []).filter((s) => (s.recurrence_interval_days ?? 0) > 0).length;

  const requested = new Set<string>([...requestedMessageCustomers, ...requestedLegacyCustomers].map((r) => r.customer_id));
  const neverRequested = metrics.filter((m) => m.subscribed && !requested.has(m.customer.id)).length;

  // ---- Series (UTC days, same bucketing as the dashboard) ----
  const sentTimes = [...((sentMessages.data ?? []) as Array<{ sent_at: string | null }>), ...((sentLegacy.data ?? []) as Array<{ sent_at: string | null }>)].map((r) => r.sent_at);
  const requestSeries = bucketDaily(sentTimes, SERIES_DAYS, now);
  const clickSeries = bucketDaily(clickTimes, SERIES_DAYS, now);
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const labels = Array.from({ length: SERIES_DAYS }, (_, i) =>
    new Date(today.getTime() - (SERIES_DAYS - 1 - i) * DAY_MS).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  );
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const requests30d = sum(requestSeries);
  const clicks30d = sum(clickSeries);
  const last7 = sum(clickSeries.slice(-7));
  const prev7 = sum(clickSeries.slice(-14, -7));
  const clicksChangePct = prev7 >= 5 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  // ---- Reputation ----
  const todayKey = dateKey(now);
  const rep = computeReputation(reputation.snapshots, todayKey);
  const reviewsGained30d = rep.hasData ? reviewsGainedBetween(reputation.snapshots, addDays(todayKey, -30), todayKey) : null;
  const milestone =
    rep.hasData && reviewsGained30d !== null ? projectMilestone(rep.totalReviews, reviewsGained30d / 30, nextMilestone(rep.totalReviews), now) : null;

  const reviews = (googleReviews.data ?? []) as Array<{ rating: number; comment: string | null; review_date: string; reply_text: string | null }>;
  const reviews90 = reviews.filter((r) => r.review_date >= since90);
  const themes = reviews.length > 0 ? analyseReviewThemes(reviews) : null;
  const unrepliedNegative = googleActive ? reviews90.filter((r) => r.rating <= 3 && !r.reply_text).length : null;
  const unreplied = googleActive ? reviews90.filter((r) => !r.reply_text).length : null;

  const billing = getBillingState(business, now);

  const healthInput: HealthInput = {
    setup: {
      hasBusinessName: Boolean(business.name?.trim()) && business.name !== 'My Business',
      hasReviewUrl: Boolean(business.google_review_url),
      hasBookingUrl: Boolean(business.booking_url),
      hasContactEmail: Boolean(business.contact_email),
      servicesWithInterval,
    },
    customers,
    requestsSent30d: requests30d,
    clicks30d,
    averageRating: rep.averageRating,
    reviewsGained30d,
    feedback90d: recentTriaged.length,
    feedbackOverdue: triaged.filter((t) => t.triage.overdue).length,
    publicReviews90d: googleActive ? reviews90.length : null,
    publicReplies90d: googleActive ? reviews90.filter((r) => r.reply_text).length : null,
    rebookingRatePct: rebooking.rate,
    lapsedSharePct,
  };

  const signals: BusinessSignals = {
    hasReviewUrl: healthInput.setup.hasReviewUrl,
    hasBookingUrl: healthInput.setup.hasBookingUrl,
    servicesWithInterval,
    customers,
    neverRequested,
    heldRequests: held,
    failedRequests: failedMessages + failedLegacy,
    newFeedback: triaged.filter((t) => t.status === 'new').length,
    overdueFeedback: stats.overdue,
    criticalFeedback: stats.critical,
    dueForRebooking: due.length,
    lapsedCustomers: lapsed.length,
    lapsedLifetimeValue,
    averageVisitValue,
    unrepliedNegativeReviews: unrepliedNegative,
    unrepliedReviews: unreplied,
    unreadReviewAlerts: unreadAlerts,
    clicksChangePct,
    billingStatus: billing.status === 'trial_expired' || billing.status === 'canceled' ? 'expired' : billing.status,
    trialDaysLeft: billing.status === 'trialing' ? billing.trialDaysLeft : null,
    rebookingRemindersEnabled: business.rebooking_reminders_enabled ?? true,
  };

  return {
    generatedAt: now.toISOString(),
    health: computeBusinessHealth(healthInput),
    healthInput,
    actions: computeNextActions(signals),
    signals,
    feedback: { items: triaged, topics: summariseTopics(recentTriaged.map((t) => t.triage)), stats },
    reputation: {
      source: reputation.source,
      hasData: rep.hasData,
      averageRating: rep.averageRating,
      totalReviews: rep.totalReviews,
      gainedThisMonth: rep.gainedThisMonth,
      gainedLastMonth: rep.gainedLastMonth,
      reviewsGained30d,
      milestone,
    },
    googleActive,
    themes,
    retention: {
      rebookingRatePct: rebooking.rate,
      customersWithVisits: withVisits.length,
      due: due.length,
      lapsed: lapsed.length,
      onTrack: onTrack.length,
      lapsedLifetimeValue,
      averageVisitValue,
    },
    series: { labels, requests: requestSeries, clicks: clickSeries },
    forecast: { requests: forecastCounts(requestSeries, 30), clicks: forecastCounts(clickSeries, 30) },
    totals: { customers, requests30d, clicks30d },
  };
}

/** Memoised per request. */
export const loadIntelligence = cache((business: Business) => build(business, new Date()));
