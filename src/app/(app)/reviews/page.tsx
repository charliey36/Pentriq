import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { getPublicConnection } from '@/lib/google-connection';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadReputation } from '@/lib/reputation-data';
import { computeReputation, generateInsights, monthlySeries } from '@/lib/reputation-metrics';
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
  type GrowthPeriod,
} from '@/lib/google-review-analytics';
import { formatUKDateTime } from '@/lib/uk-defaults';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { AlertsPanel, type AlertItem } from './alerts-panel';
import { MonthlyGainedChart, RatingDistributionChart, RatingTrendChart, ReviewGrowthChart, VelocityTrendChart } from './review-charts';
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

const TABS = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'insights', label: 'Insights' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'connections', label: 'Connections' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const TONE_DOT = { good: 'bg-brand-500', bad: 'bg-red-500', neutral: 'bg-line-strong' } as const;

export default async function ReviewsAnalyticsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; range?: string; from?: string; to?: string };
}) {
  const business = await requireBusiness();
  const connection = await getPublicConnection(business.id);
  const tab: TabKey = TABS.find((t) => t.key === searchParams?.tab)?.key ?? 'analytics';
  const today = dateKey(new Date());
  const range = resolveRange(searchParams ?? {}, today);
  const googleActive = connection?.status === 'active' && Boolean(connection.google_location_id);

  // Numbers come from Google once synced data exists, otherwise from manual snapshots (same shape either way).
  const admin = createAdminClient();
  const { source, snapshots } = await loadReputation(admin, business.id, googleActive);
  const live = source === 'google';

  // Individual reviews exist only for Google.
  const supabase = createClient();
  const reviews: ReviewItem[] = [];
  let loadError: string | null = null;
  if (live) {
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
  }

  const { data: alertRows } = await supabase
    .from('review_alerts')
    .select('id, type, title, message, is_read, created_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(20);
  const alerts = (alertRows ?? []) as AlertItem[];

  const rep = computeReputation(snapshots, today);
  const months = monthlySeries(snapshots, today, 12);
  const inRange = filterByRange(reviews, range.from, range.to);
  const trend = bucketSeries(dailySeries(snapshots, reviews, range.from, range.to));
  const growth = Object.fromEntries(
    GROWTH_PERIODS.map((p) => {
      const r = growthRange(p, today);
      return [p, bucketSeries(dailySeries(snapshots, reviews, r.from, r.to))];
    })
  ) as Record<GrowthPeriod, ReturnType<typeof dailySeries>>;

  const q = (extra: Record<string, string>) => `/reviews?${new URLSearchParams({ tab, ...(searchParams?.range ? { range: searchParams.range } : {}), ...extra })}`;
  const velocityText = rep.velocity === null ? '\u2014' : `${rep.velocity > 0 ? '+' : ''}${rep.velocity}%`;
  const change = rep.ratingChange;

  const filter = (
    <section aria-label="Date filter" className="card mb-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_LINKS.map((r) => (
          <Link
            key={r.key}
            href={`/reviews?tab=${tab}&range=${r.key}`}
            scroll={false}
            aria-current={range.key === r.key ? 'true' : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${range.key === r.key ? 'bg-brand-500/15 text-brand-800 ring-1 ring-inset ring-brand-500/30 dark:text-brand-200' : 'text-ink-3 hover:bg-surface-muted hover:text-ink'}`}
          >
            {r.label}
          </Link>
        ))}
      </div>
      <form method="get" action="/reviews" className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="range" value="custom" />
        <div>
          <label htmlFor="range-from" className="label">From</label>
          <input id="range-from" name="from" type="date" required max={today} defaultValue={range.key === 'custom' ? range.from : ''} className="input mt-1" />
        </div>
        <div>
          <label htmlFor="range-to" className="label">To</label>
          <input id="range-to" name="to" type="date" required max={today} defaultValue={range.key === 'custom' ? range.to : ''} className="input mt-1" />
        </div>
        <button type="submit" className={`btn btn-sm ${range.key === 'custom' ? 'btn-primary' : 'btn-secondary'}`}>Apply custom range</button>
      </form>
      <p className="mt-3 text-xs text-ink-3">
        Showing <span className="font-medium text-ink-2">{range.key === 'custom' ? `${range.from} to ${range.to}` : range.label}</span>
      </p>
    </section>
  );

  return (
    <div>
      <PageHeader
        title="Reviews Analytics"
        icon="star"
        tone="amber"
        description="Track your reputation: review growth, rating trends, insights and alerts."
        actions={googleActive ? <SyncButton /> : <Link href="/settings/reputation" className="btn btn-secondary btn-sm">Update my numbers</Link>}
      />

      <nav aria-label="Reviews sections" className="scroll-thin -mt-4 mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={q({ tab: t.key })}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors ${tab === t.key ? 'border-brand-600 text-ink dark:border-brand-400' : 'border-transparent text-ink-3 hover:border-line-strong hover:text-ink'}`}
          >
            {t.label}
            {t.key === 'alerts' && alerts.some((a) => !a.is_read) && <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-2xs font-semibold text-white">{alerts.filter((a) => !a.is_read).length}</span>}
          </Link>
        ))}
      </nav>

      {loadError && (
        <Notice variant="error" className="mb-6">
          Couldn&apos;t load review data ({loadError}). Apply migrations <code>0019</code>–<code>0021</code> in Supabase.
        </Notice>
      )}
      {connection?.status === 'needs_reconnect' && (
        <Notice variant="error" className="mb-6">
          Pentriq lost access to your Google account. <Link href="/settings/integrations" className="font-medium underline">Reconnect in Settings</Link>.
        </Notice>
      )}

      {(tab === 'analytics' || tab === 'insights') && !rep.hasData && (
        <SectionCard className="mb-6">
          <EmptyState
            icon="chart"
            title="Start tracking your reputation"
            description="Enter your current review count and average rating. Add a new snapshot whenever you like and Pentriq will chart your growth. Google sync will take over automatically once it's connected."
            action={<Link href="/settings/reputation" className="btn btn-primary">Add your first snapshot</Link>}
          />
        </SectionCard>
      )}

      {tab === 'analytics' && rep.hasData && (
        <>
          <p className="-mt-2 mb-5 text-xs text-ink-3">
            {live ? `${connection?.location_name ?? 'Google'} \u00b7 ${connection?.last_sync_at ? `last synced ${formatUKDateTime(new Date(connection.last_sync_at))}` : 'not synced yet'}` : 'Tracking manually \u00b7 numbers come from your snapshots'}
          </p>
          <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Average Rating" tone="amber" icon="star" value={rep.averageRating === null ? '\u2014' : `${rep.averageRating.toFixed(1)}\u2605`} hint={`Across ${rep.totalReviews.toLocaleString('en-GB')} reviews`} />
            <StatCard label="Total Reviews" tone="sky" icon="chat" value={rep.totalReviews.toLocaleString('en-GB')} hint={live ? 'On Google' : 'From your latest snapshot'} />
            <StatCard label="Gained This Month" tone="emerald" icon="calendar" value={`+${rep.gainedThisMonth.toLocaleString('en-GB')}`} hint={`${rep.gainedLastMonth.toLocaleString('en-GB')} last month`} />
            <StatCard label="Rating Change" tone={change === null || change === 0 ? 'slate' : change > 0 ? 'emerald' : 'rose'} icon={change !== null && change < 0 ? 'arrowDown' : 'arrowUp'} value={formatRatingChange(change === null ? null : Math.round(change * 10) / 10)} hint="This month vs last month end" />
            <StatCard label="Review Velocity" tone={rep.velocity === null || rep.velocity === 0 ? 'slate' : rep.velocity > 0 ? 'violet' : 'rose'} icon="bolt" value={velocityText} hint={rep.velocity === null ? 'Needs a previous month with snapshots' : 'Daily pace vs last month'} />
          </div>

          <SectionCard className="mb-6" title="Review count over time" description="Total reviews by date.">
            <ReviewGrowthChart series={growth} />
          </SectionCard>
          {filter}
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <SectionCard className={live ? 'lg:col-span-3' : 'lg:col-span-5'} title="Average rating over time" description="Average rating in the selected period.">
              <RatingTrendChart data={trend} />
            </SectionCard>
            {live && (
              <SectionCard className="lg:col-span-2" title="Rating distribution" description="Reviews by star rating in the selected period.">
                <RatingDistributionChart rows={ratingDistribution(inRange)} />
              </SectionCard>
            )}
          </div>
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionCard title="Monthly reviews gained" description="Last 12 months.">
              <MonthlyGainedChart data={months} />
            </SectionCard>
            <SectionCard title="Review velocity trend" description="Change in daily review pace vs the previous month.">
              <VelocityTrendChart data={months} />
            </SectionCard>
          </div>
        </>
      )}

      {tab === 'insights' && rep.hasData && (
        <>
          {filter}
          <SectionCard className="mb-6" title="Insights" description={`Compared with the ${range.key === 'custom' ? 'previous period of the same length' : 'period before'}.`}>
            <ul className="space-y-3">
              {generateInsights(snapshots, range).map((i) => (
                <li key={i.text} className="flex items-start gap-3 text-sm text-ink-2">
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${TONE_DOT[i.tone]}`} />
                  {i.text}
                </li>
              ))}
            </ul>
          </SectionCard>
          {live && (() => {
            const m = monthlyInsights(reviews, today);
            return (
              <SectionCard title="This month" description="From individual Google reviews.">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                  {[
                    ['Reviews gained', m.reviewsGained.toString()],
                    ['Average rating', m.averageRating === null ? '\u2014' : `${m.averageRating.toFixed(1)}\u2605`],
                    ['Best rating', m.bestRating === null ? '\u2014' : `${m.bestRating}\u2605`],
                    ['Worst rating', m.worstRating === null ? '\u2014' : `${m.worstRating}\u2605`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[13px] font-medium text-ink-3">{label}</dt>
                      <dd className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="mt-5 space-y-1 border-t border-line pt-4 text-sm text-ink-2">{m.sentences.map((t) => <li key={t}>{t}</li>)}</ul>
              </SectionCard>
            );
          })()}
        </>
      )}

      {tab === 'reviews' && (
        <SectionCard title="Recent reviews" description={live ? 'Newest first.' : undefined}>
          {live && reviews.length > 0 ? (
            <ReviewList reviews={reviews.slice(0, MAX_LISTED)} canReply />
          ) : (
            <EmptyState
              icon="star"
              title={live ? 'No reviews imported yet' : 'Individual reviews arrive with Google sync'}
              description={live ? 'Reviews appear after the first sync completes.' : 'Until Google Business Profile is connected, track your totals with snapshots. Reviewer names, comments and replies will show here automatically afterwards.'}
              action={live ? undefined : <Link href="/settings/reputation" className="btn btn-secondary">Track manually</Link>}
              className="py-8"
            />
          )}
        </SectionCard>
      )}

      {tab === 'alerts' && (
        <SectionCard title="Alerts" description="New reviews, 1-star reviews and rating drops.">
          {alerts.length === 0 ? (
            <EmptyState icon="inbox" title="No alerts yet" description="We'll flag drops in your rating here. With Google connected you also get new-review and 1-star alerts." className="py-8" />
          ) : (
            <AlertsPanel alerts={alerts} unread={alerts.filter((a) => !a.is_read).length} />
          )}
        </SectionCard>
      )}

      {tab === 'connections' && (
        <SectionCard title="Review sources" description="Where your reputation numbers come from.">
          <ul className="divide-y divide-line/70">
            <li className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
              <div>
                <p className="text-sm font-semibold text-ink">Manual tracking</p>
                <p className="text-xs text-ink-3">{source === 'manual' && rep.hasData ? 'In use: your snapshots drive this dashboard.' : rep.hasData ? 'Available as a fallback.' : 'No snapshots yet.'}</p>
              </div>
              <Link href="/settings/reputation" className="btn btn-secondary btn-sm">Manage snapshots</Link>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 py-4 last:pb-0">
              <div>
                <p className="text-sm font-semibold text-ink">Google Business Profile</p>
                <p className="text-xs text-ink-3">{live ? `Connected${connection?.location_name ? ` to ${connection.location_name}` : ''}: reviews sync automatically.` : googleActive ? 'Connected, waiting for the first sync.' : 'Coming soon: automatic review sync, replies and alerts.'}</p>
              </div>
              <Link href="/settings/integrations" className="btn btn-secondary btn-sm">{connection ? 'Manage' : 'Learn more'}</Link>
            </li>
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
