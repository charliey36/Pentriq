import Link from 'next/link';
import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { loadIntelligence } from '@/lib/intelligence/load';
import { TOPIC_LABELS } from '@/lib/intelligence/lexicon';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icons';
import { StarFilled } from '@/components/ui/icons';
import { ActivityChart } from '@/components/ui/activity-chart';
import { HealthScoreCard } from '@/components/intelligence/health-score-card';
import { NextActions } from '@/components/intelligence/next-actions';
import { AskPentriqButton } from '@/components/intelligence/ask-button';
import { formatUKDate } from '@/lib/uk-defaults';

export const metadata: Metadata = { title: 'Insights' };

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

export default async function InsightsPage() {
  const business = await requireBusiness();
  const intel = await loadIntelligence(business);
  const { retention, reputation, forecast, feedback, themes } = intel;

  const retentionTotal = retention.due + retention.lapsed + retention.onTrack;
  const share = (n: number) => (retentionTotal > 0 ? (n / retentionTotal) * 100 : 0);
  const hasSeries = intel.series.requests.some((v) => v > 0) || intel.series.clicks.some((v) => v > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        icon="sparkles"
        tone="emerald"
        description="Pentriq reads your numbers and tells you what to do next: your health score, ranked actions, forecasts and what customers are saying."
        actions={
          <>
            <AskPentriqButton />
            <Link href="/reports" className="btn btn-secondary btn-sm">
              <Icon name="report" className="h-4 w-4" />
              Executive report
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_1fr]">
        <HealthScoreCard report={intel.health} className="reveal" />
        <NextActions actions={intel.actions} limit={6} className="reveal" />
      </div>

      {/* Forecasts */}
      <section aria-labelledby="forecast-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="forecast-title" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">The next 30 days</h2>
            <p className="text-[13px] text-ink-3">Projected from the last 30 days with trend smoothing. Shown as a range of likely outcomes, not a promise.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Review requests (projected)"
            tone="sky"
            icon="mail"
            value={forecast.requests.reliable ? `~${forecast.requests.expected.toLocaleString('en-GB')}` : '—'}
            hint={
              forecast.requests.reliable
                ? `${forecast.requests.direction === 'rising' ? 'Rising' : forecast.requests.direction === 'falling' ? 'Falling' : 'Steady'} · ${intel.totals.requests30d} in the last 30 days`
                : 'Needs about two weeks of sending history'
            }
          />
          <StatCard
            label="Review-link clicks (projected)"
            tone="violet"
            icon="cursor"
            value={forecast.clicks.reliable ? `~${forecast.clicks.expected.toLocaleString('en-GB')}` : '—'}
            hint={
              forecast.clicks.reliable
                ? `${forecast.clicks.direction === 'rising' ? 'Rising' : forecast.clicks.direction === 'falling' ? 'Falling' : 'Steady'} · ${intel.totals.clicks30d} in the last 30 days`
                : 'Appears once customers start clicking'
            }
          />
          <StatCard
            label="Next review milestone"
            tone="amber"
            icon="target"
            value={reputation.milestone ? reputation.milestone.target.toLocaleString('en-GB') : '—'}
            hint={
              !reputation.milestone
                ? 'Record your review count in Reputation settings'
                : reputation.milestone.daysToTarget === 0
                  ? 'Reached. Next goal unlocks soon'
                  : reputation.milestone.eta
                    ? `Around ${formatUKDate(reputation.milestone.eta)} at your current pace`
                    : 'No new reviews in 30 days, so no ETA yet'
            }
          />
          <StatCard
            label="Revenue due to rebook"
            tone="emerald"
            icon="calendar"
            value={retention.averageVisitValue && retention.due > 0 ? gbp(retention.due * retention.averageVisitValue) : '—'}
            hint={
              retention.due > 0
                ? `${retention.due} customer${retention.due === 1 ? '' : 's'} due × your average visit${retention.averageVisitValue ? ` (${gbp(retention.averageVisitValue)})` : ''}`
                : 'Nobody is due right now'
            }
            href={retention.due > 0 ? '/segments?preset=due' : undefined}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" title="Last 30 days" description="Daily review requests and review-link clicks.">
          {hasSeries ? (
            <ActivityChart
              labels={intel.series.labels}
              series={[
                { key: 'requests', label: 'Requests sent', tone: 'sky', data: intel.series.requests },
                { key: 'clicks', label: 'Link clicks', tone: 'violet', data: intel.series.clicks },
              ]}
            />
          ) : (
            <EmptyState icon="chart" title="No activity yet" description="Your daily pattern appears once requests start going out." className="py-10" />
          )}
        </SectionCard>

        <SectionCard title="Retention" description="Where your customers are in their rebooking cycle.">
          {retentionTotal === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nothing to measure yet"
              description="Log visits against services that have a rebooking interval."
              className="py-6"
              action={<Link href="/settings/services" className="btn btn-secondary btn-sm">Set intervals</Link>}
            />
          ) : (
            <div>
              <p className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-[-0.03em] text-ink tabular-nums">
                  {retention.rebookingRatePct === null ? '—' : `${retention.rebookingRatePct}%`}
                </span>
                <span className="text-[13px] text-ink-3">rebook within 30 days</span>
              </p>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${retention.onTrack} on track, ${retention.due} due, ${retention.lapsed} lapsed`}>
                <span className="bar-grow h-full bg-brand-500" style={{ width: `${share(retention.onTrack)}%` }} />
                <span className="bar-grow h-full bg-amber-400" style={{ width: `${share(retention.due)}%` }} />
                <span className="bar-grow h-full bg-rose-500" style={{ width: `${share(retention.lapsed)}%` }} />
              </div>
              <ul className="mt-4 space-y-2 text-[13px]">
                {[
                  { label: 'On track', value: retention.onTrack, dot: 'bg-brand-500', href: '/segments?preset=regulars' },
                  { label: 'Due to rebook', value: retention.due, dot: 'bg-amber-400', href: '/segments?preset=due' },
                  { label: 'Lapsed', value: retention.lapsed, dot: 'bg-rose-500', href: '/segments?preset=lapsed' },
                ].map((row) => (
                  <li key={row.label}>
                    <Link href={row.href} className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-muted/70">
                      <span className="flex items-center gap-2 text-ink-2">
                        <span className={`h-2 w-2 rounded-full ${row.dot}`} />
                        {row.label}
                      </span>
                      <span className="flex items-center gap-1 font-semibold tabular-nums text-ink">
                        {row.value.toLocaleString('en-GB')}
                        <Icon name="chevronRight" className="h-3.5 w-3.5 text-ink-4 group-hover:text-ink-2" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {retention.lapsedLifetimeValue > 0 && (
                <p className="mt-3 rounded-lg bg-rose-500/[0.07] px-3 py-2 text-xs leading-5 text-rose-800 dark:text-rose-200">
                  Lapsed customers have spent {gbp(retention.lapsedLifetimeValue)} with you. A win-back reminder is the cheapest growth you have.
                </p>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Voice of the customer */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="What private feedback is about"
          description="Last 90 days, auto-categorised. Nothing is sent outside Pentriq to do this."
          action={<Link href="/feedback-inbox" className="text-[13px] font-medium text-brand-700 dark:text-brand-400">Open inbox</Link>}
        >
          {feedback.topics.length === 0 ? (
            <EmptyState icon="chat" title="No feedback topics yet" description="Topics appear as customers send private feedback." className="py-6" />
          ) : (
            <ul className="space-y-3.5">
              {feedback.topics.slice(0, 6).map((topic) => {
                const max = feedback.topics[0].count;
                return (
                  <li key={topic.topic}>
                    <Link href={`/feedback-inbox?topic=${topic.topic}`} className="group block">
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="font-medium text-ink-2 group-hover:text-ink">{topic.label}</span>
                        <span className="tabular-nums text-ink-3">
                          {topic.count} mention{topic.count === 1 ? '' : 's'}
                          {topic.negative > 0 && <span className="ml-2 text-rose-600 dark:text-rose-400">{topic.negative} negative</span>}
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                        <span className="bar-grow h-full bg-rose-500/80" style={{ width: `${(topic.negative / max) * 100}%` }} />
                        <span className="bar-grow h-full bg-brand-500/80" style={{ width: `${(topic.positive / max) * 100}%` }} />
                        <span className="bar-grow h-full bg-ink-4/40" style={{ width: `${((topic.count - topic.negative - topic.positive) / max) * 100}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="What Google reviews say"
          description={themes ? `Themes from ${themes.withText} written reviews in the last 12 months.` : 'Themes from your public reviews.'}
          action={intel.googleActive ? <Link href="/reviews?tab=reviews" className="text-[13px] font-medium text-brand-700 dark:text-brand-400">All reviews</Link> : undefined}
        >
          {!themes || themes.themes.length === 0 ? (
            <EmptyState
              icon="star"
              title={intel.googleActive ? 'Not enough written reviews yet' : 'Connect Google to see review themes'}
              description={intel.googleActive ? 'Themes appear once a few reviews mention the same thing.' : 'Pentriq will group what customers praise and criticise.'}
              className="py-6"
              action={!intel.googleActive ? <Link href="/settings/integrations" className="btn btn-secondary btn-sm">Integrations</Link> : undefined}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {([['Praised for', themes.praise, 'text-brand-700 dark:text-brand-300'], ['Watch out for', themes.concerns, 'text-rose-700 dark:text-rose-300']] as const).map(([heading, list, color]) => (
                <div key={heading}>
                  <p className={`eyebrow ${color}`}>{heading}</p>
                  {list.length === 0 ? (
                    <p className="mt-2 text-[13px] text-ink-3">Nothing stands out.</p>
                  ) : (
                    <ul className="mt-2 space-y-3">
                      {list.map((theme) => (
                        <li key={theme.topic} className="rounded-xl border border-line bg-surface-subtle/60 p-3">
                          <p className="flex items-center justify-between gap-2 text-[13px] font-semibold text-ink">
                            {TOPIC_LABELS[theme.topic]}
                            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-ink-3">
                              <StarFilled className="h-3 w-3 text-amber-400" />
                              {theme.averageRating.toFixed(1)} · {theme.mentions}
                            </span>
                          </p>
                          {theme.example && <p className="mt-1.5 text-xs italic leading-5 text-ink-3">&ldquo;{theme.example}&rdquo;</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-4">
        <Icon name="info" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        Insights are computed inside Pentriq from your own data with documented, explainable rules: no customer text is sent to an AI provider for this page. Money figures are estimates from your recorded visit prices.
      </p>
    </div>
  );
}
