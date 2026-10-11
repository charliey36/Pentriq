import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { getPublicConnection } from '@/lib/google-connection';
import {
  bucketSeries,
  dailySeries,
  dateKey,
  filterByRange,
  formatRatingChange,
  GROWTH_PERIODS,
  growthRange,
  monthlyInsights,
  ratingDistribution,
  resolveRange,
  summarize,
  type GrowthPeriod,
  type SnapshotLite,
} from '@/lib/google-review-analytics';
import { formatUKDateTime } from '@/lib/uk-defaults';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { AlertsPanel, type AlertItem } from './alerts-panel';
import { RatingDistributionChart, RatingTrendChart, ReviewGrowthChart } from './review-charts';
import { ReviewList, type ReviewItem } from './review-list';
import { SyncButton } from './sync-button';

export const metadata: Metadata = { title: 'Reviews Analytics' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
const MAX_LISTED = 50;

const RANGE_LINKS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '12m', label: 'Last 12 months' },
] as const;

export default async function ReviewsAnalyticsPage({
  searchParams,
}: {
  searchParams?: { range?: string; from?: string; to?: string };
}) {
  const business = await requireBusiness();
  const connection = await getPublicConnection(business.id);

  const header = (actions?: React.ReactNode) => (
    <PageHeader
      title="Reviews Analytics"
      icon="star"
      tone="amber"
      description="Your Google reviews, rating trends and replies in one place."
      actions={actions}
    />
  );

  if (!connection || !connection.google_location_id || connection.status === 'pending_location') {
    return (
      <div>
        {header()}
        <SectionCard>
          <EmptyState
            icon="star"
            title="Connect your Google Business Profile"
            description="Sign in with Google and choose your location. Pentriq will import your reviews, track your rating and let you reply, with no review URL to paste."
            action={
              <Link href="/settings/integrations" className="btn btn-primary">
                Go to Integrations
              </Link>
            }
          />
        </SectionCard>
      </div>
    );
  }

  const supabase = createClient();
  const today = dateKey(new Date());

  // Reads go through the user's session (RLS). Page in 1,000-row chunks: PostgREST caps a single response.
  const reviews: ReviewItem[] = [];
  let loadError: string | null = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('google_reviews')
      .select('id, reviewer_name, reviewer_photo_url, rating, comment, review_date, reply_text, reply_update_time')
      .eq('business_id', business.id)
      .order('review_date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      loadError = error.message;
      break;
    }
    reviews.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const snapshots: SnapshotLite[] = [];
  if (!loadError) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('review_metrics_daily')
        .select('date, total_reviews, average_rating, reviews_gained_today')
        .eq('business_id', business.id)
        .order('date', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        loadError = error.message;
        break;
      }
      snapshots.push(...(data ?? []).map((s) => ({ ...s, average_rating: Number(s.average_rating) })));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  if (loadError) {
    return (
      <div>
        {header()}
        <Notice variant="error">
          Couldn&apos;t load review data ({loadError}). If this is a new deployment, apply migration{' '}
          <code>0019_google_business_profile.sql</code> in Supabase.
        </Notice>
      </div>
    );
  }

  const { data: alertRows } = await supabase
    .from('review_alerts')
    .select('id, type, title, message, is_read, created_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(10);
  const alerts = (alertRows ?? []) as AlertItem[];
  const unreadAlerts = alerts.filter((a) => !a.is_read).length;

  // --- analytics ------------------------------------------------------------
  const range = resolveRange(searchParams ?? {}, today);
  const summary = summarize(reviews, snapshots, today);
  const insights = monthlyInsights(reviews, today);
  const inRange = filterByRange(reviews, range.from, range.to);
  const distribution = ratingDistribution(inRange);
  const trend = bucketSeries(dailySeries(snapshots, reviews, range.from, range.to));
  const growth = Object.fromEntries(
    GROWTH_PERIODS.map((p) => {
      const r = growthRange(p, today);
      return [p, bucketSeries(dailySeries(snapshots, reviews, r.from, r.to))];
    })
  ) as Record<GrowthPeriod, ReturnType<typeof dailySeries>>;
  const listed = inRange.slice(0, MAX_LISTED);

  const change = summary.ratingChange;
  const changeTone = change === null || change === 0 ? 'slate' : change > 0 ? 'emerald' : 'rose';

  return (
    <div>
      {header(<SyncButton />)}

      <p className="-mt-4 mb-6 text-xs text-ink-3">
        {connection.location_name ?? 'Google location'} &middot;{' '}
        {connection.last_sync_at ? `last synced ${formatUKDateTime(new Date(connection.last_sync_at))}` : 'not synced yet'} &middot;
        synced automatically once a day, or use Sync now
      </p>

      {connection.status === 'needs_reconnect' && (
        <Notice variant="error" className="mb-6">
          Pentriq lost access to your Google account, so data may be out of date.{' '}
          <Link href="/settings/integrations" className="font-medium underline">
            Reconnect in Settings
          </Link>
          .
        </Notice>
      )}
      {connection.last_sync_error && connection.status !== 'needs_reconnect' && (
        <Notice variant="warning" className="mb-6">
          The last sync had a problem: {connection.last_sync_error}
        </Notice>
      )}

      {alerts.length > 0 && (
        <SectionCard className="mb-6" title="Alerts" description="New reviews, 1-star reviews and rating drops.">
          <AlertsPanel alerts={alerts} unread={unreadAlerts} />
        </SectionCard>
      )}

      {/* Summary cards (current month vs last month; not affected by the date filter) */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Average Rating"
          tone="amber"
          icon="star"
          value={summary.averageRating === null ? '\u2014' : `${summary.averageRating.toFixed(1)}\u2605`}
          hint={summary.totalReviews > 0 ? `Across all ${summary.totalReviews.toLocaleString('en-GB')} reviews` : 'No reviews yet'}
        />
        <StatCard
          label="Total Reviews"
          tone="sky"
          icon="chat"
          value={
            <>
              {summary.totalReviews.toLocaleString('en-GB')}
              <span className="ml-2 text-base font-medium tracking-normal text-ink-3">Reviews</span>
            </>
          }
          hint="On your Google Business Profile"
        />
        <StatCard
          label="Reviews This Month"
          tone="emerald"
          icon="calendar"
          value={
            <>
              +{summary.reviewsThisMonth.toLocaleString('en-GB')}
              <span className="ml-2 text-base font-medium tracking-normal text-ink-3">Reviews</span>
            </>
          }
          hint={`${summary.reviewsLastMonth.toLocaleString('en-GB')} last month`}
        />
        <StatCard
          label="Rating Change"
          tone={changeTone}
          icon={change !== null && change < 0 ? 'arrowDown' : 'arrowUp'}
          value={formatRatingChange(change)}
          hint={
            change === null
              ? 'Needs reviews from before this month'
              : `vs last month (${summary.previousMonthAverage?.toFixed(1)}\u2605 at month end)`
          }
        />
      </div>

      <SectionCard className="mb-6" title="Review growth" description="Total reviews over time.">
        <ReviewGrowthChart series={growth} />
      </SectionCard>

      {/* Date filter: scopes the rating trend, distribution and review list below */}
      <section aria-label="Date filter" className="card mb-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_LINKS.map((r) => (
            <Link
              key={r.key}
              href={`/reviews?range=${r.key}`}
              scroll={false}
              aria-current={range.key === r.key ? 'true' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                range.key === r.key
                  ? 'bg-brand-500/15 text-brand-800 ring-1 ring-inset ring-brand-500/30 dark:text-brand-200'
                  : 'text-ink-3 hover:bg-surface-muted hover:text-ink'
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        <form method="get" action="/reviews" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="range" value="custom" />
          <div>
            <label htmlFor="range-from" className="label">
              From
            </label>
            <input id="range-from" name="from" type="date" required max={today} defaultValue={range.key === 'custom' ? range.from : ''} className="input mt-1" />
          </div>
          <div>
            <label htmlFor="range-to" className="label">
              To
            </label>
            <input id="range-to" name="to" type="date" required max={today} defaultValue={range.key === 'custom' ? range.to : ''} className="input mt-1" />
          </div>
          <button type="submit" className={`btn btn-sm ${range.key === 'custom' ? 'btn-primary' : 'btn-secondary'}`}>
            Apply custom range
          </button>
        </form>
        <p className="mt-3 text-xs text-ink-3">
          Showing <span className="font-medium text-ink-2">{range.key === 'custom' ? `${range.from} to ${range.to}` : range.label}</span>
          {' '}&middot; {inRange.length.toLocaleString('en-GB')} review{inRange.length === 1 ? '' : 's'}
        </p>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <SectionCard className="lg:col-span-3" title="Average rating" description="Overall average rating over the selected period.">
          <RatingTrendChart data={trend} />
        </SectionCard>
        <SectionCard className="lg:col-span-2" title="Rating distribution" description="Reviews by star rating in the selected period.">
          <RatingDistributionChart rows={distribution} />
        </SectionCard>
      </div>

      <SectionCard className="mb-6" title="Monthly insights" description="This calendar month.">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          {[
            ['Reviews gained', insights.reviewsGained.toString()],
            ['Average rating', insights.averageRating === null ? '\u2014' : `${insights.averageRating.toFixed(1)}\u2605`],
            ['Best rating', insights.bestRating === null ? '\u2014' : `${insights.bestRating}\u2605`],
            ['Worst rating', insights.worstRating === null ? '\u2014' : `${insights.worstRating}\u2605`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] font-medium text-ink-3">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-5 space-y-1 border-t border-line pt-4 text-sm text-ink-2">
          {insights.sentences.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Recent reviews"
        description={`Newest first${inRange.length > MAX_LISTED ? `, showing ${MAX_LISTED} of ${inRange.length.toLocaleString('en-GB')}` : ''}.`}
      >
        {listed.length === 0 ? (
          <EmptyState
            icon="star"
            title={reviews.length === 0 ? 'No reviews imported yet' : 'No reviews in this period'}
            description={reviews.length === 0 ? 'Reviews appear after the first sync completes.' : 'Try a wider date range.'}
            className="py-8"
          />
        ) : (
          <ReviewList reviews={listed} canReply={connection.status === 'active'} />
        )}
      </SectionCard>
    </div>
  );
}
