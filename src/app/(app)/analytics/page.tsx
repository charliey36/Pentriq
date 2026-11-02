import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { computeRebookingRate, computeRevenueAttribution, computeHealthScore } from '@/lib/health';
import { fetchAll } from '@/lib/fetch-all';
import { getCampaignPerformance, getRecentClicks, getReviewLinkTotals } from '@/lib/click-analytics';
import { formatUKDateTime } from '@/lib/uk-defaults';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { CountUp } from '@/components/ui/count-up';

export const metadata: Metadata = { title: 'Analytics' };

// Order matters: it is the order of the stacked bar and the legend.
const tiers = [
  { key: 'thriving', label: 'Thriving', description: 'Frequent, recent, high spend', bar: 'bg-brand-500', dot: 'bg-brand-500' },
  { key: 'steady', label: 'Steady', description: 'Healthy, regular activity', bar: 'bg-sky-500', dot: 'bg-sky-500' },
  { key: 'at_risk', label: 'At risk', description: 'Slowing down \u2014 worth a nudge', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  { key: 'lapsed', label: 'Lapsed', description: 'No recent visits', bar: 'bg-red-500', dot: 'bg-red-500' },
] as const;

export default async function AnalyticsPage() {
  const business = await requireBusiness();
  const supabase = createClient();

  const [visits, customers, { data: services }, linkTotals, campaigns, recentClicks] = await Promise.all([
    fetchAll((from, to) => supabase.from('visits').select('*').eq('business_id', business.id).order('id').range(from, to)),
    fetchAll((from, to) => supabase.from('customers').select('id').eq('business_id', business.id).order('id').range(from, to)),
    supabase.from('services').select('id, recurrence_interval_days').eq('business_id', business.id),
    getReviewLinkTotals(supabase, business.id),
    getCampaignPerformance(supabase, business.id),
    getRecentClicks(supabase, business.id, 10),
  ]);

  const rebookingRate = computeRebookingRate(visits);
  const revenueAttribution = await computeRevenueAttribution(supabase, business.id);

  const serviceIntervalById = new Map((services ?? []).map((s) => [s.id, s.recurrence_interval_days]));

  const healthTierCounts = { thriving: 0, steady: 0, at_risk: 0, lapsed: 0 };
  // Group once; filtering the whole visit list per customer was quadratic.
  const visitsByCustomer = new Map<string, typeof visits>();
  for (const v of visits) {
    const list = visitsByCustomer.get(v.customer_id);
    if (list) list.push(v);
    else visitsByCustomer.set(v.customer_id, [v]);
  }
  for (const customer of customers) {
    const customerVisits = visitsByCustomer.get(customer.id) ?? [];
    if (customerVisits.length === 0) continue;
    const interval = serviceIntervalById.get(customerVisits[0].service_id ?? '') ?? null;
    const health = computeHealthScore(customerVisits, interval);
    healthTierCounts[health.tier] += 1;
  }

  const healthTotal = Object.values(healthTierCounts).reduce((sum, count) => sum + count, 0);
  const rate = rebookingRate.rate;

  return (
    <div>
      <PageHeader
        title="Analytics"
        icon="chart"
        tone="emerald"
        description="Review link clicks, rebooking rate, revenue influenced by automated messages, and customer health distribution."
      />

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Review link clicks"
          tone="violet"
          icon="cursor"
          value={<CountUp value={linkTotals.clicks} />}
          hint={
            linkTotals.clicks === 0
              ? 'Clicks appear once customers open your review link'
              : `${linkTotals.uniqueClicked.toLocaleString('en-GB')} email${linkTotals.uniqueClicked === 1 ? '' : 's'} clicked at least once. Bots and email scanners are excluded.`
          }
        />
        <StatCard
          label="Click-through rate"
          tone="amber"
          icon="chart"
          value={
            linkTotals.clickThroughRate === null ? (
              '\u2014'
            ) : (
              <CountUp value={linkTotals.clickThroughRate} decimals={1} suffix="%" />
            )
          }
          hint={
            linkTotals.delivered > 0
              ? `${linkTotals.clicks.toLocaleString('en-GB')} clicks \u00f7 ${linkTotals.delivered.toLocaleString('en-GB')} delivered emails`
              : 'Needs at least one sent request'
          }
        />
        <StatCard
          label="Emails delivered"
          tone="sky"
          icon="mail"
          value={<CountUp value={linkTotals.delivered} />}
          hint="Accepted by the email provider. Opens and bounces aren't tracked."
        />
        <StatCard
          label="Reviews received"
          tone="emerald"
          icon="star"
          value={<CountUp value={linkTotals.reviewsReceived} />}
          hint="Reviews confirmed in Pentriq. Google reviews can't be read back automatically."
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Campaign performance"
          description="Sent emails and clicks for each step of your review sequence."
          flush
        >
          {campaigns.length === 0 ? (
            <EmptyState
              icon="mail"
              title="No review emails sent yet"
              description="Performance by campaign step appears once requests go out."
              className="py-10"
            />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th className="text-right">Sent</th>
                    <th className="text-right">Clicked</th>
                    <th className="text-right">Total clicks</th>
                    <th className="text-right">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((row) => (
                    <tr key={row.key}>
                      <td className="font-medium text-ink">{row.label}</td>
                      <td className="text-right tabular-nums">{row.sent.toLocaleString('en-GB')}</td>
                      <td className="text-right tabular-nums">{row.clicked.toLocaleString('en-GB')}</td>
                      <td className="text-right tabular-nums">{row.totalClicks.toLocaleString('en-GB')}</td>
                      <td className="text-right tabular-nums">
                        {row.clickThroughRate === null ? '\u2014' : `${row.clickThroughRate}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent clicks" description="Latest customers to open your review link.">
          {recentClicks.length === 0 ? (
            <EmptyState icon="cursor" title="No clicks yet" description="Clicks show up here as they happen." className="py-6" />
          ) : (
            <ul className="divide-y divide-line/70">
              {recentClicks.map((click) => (
                <li key={click.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span className="min-w-0 truncate font-medium text-ink">{click.customerName ?? 'Customer'}</span>
                  <time dateTime={click.occurredAt} className="flex-shrink-0 text-ink-3 tabular-nums">
                    {formatUKDateTime(new Date(click.occurredAt))}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <StatCard
          label="30-day rebooking rate"
          tone="sky"
          icon="refresh"
          value={
            rate === null ? (
              '\u2014'
            ) : (
              <CountUp value={rate} decimals={Number.isInteger(rate) ? 0 : 1} suffix="%" />
            )
          }
        >
          {rate === null ? (
            <p className="text-xs leading-5 text-ink-3">
              Not enough visit data yet. Log customer visits to see how many rebook within 30 days.
            </p>
          ) : (
            <>
              {/* Gauge with the 60-80% "healthy" benchmark band behind the fill. */}
              <div className="relative h-2.5 rounded-full bg-surface-muted">
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 border-x border-dashed border-sky-500/60 bg-sky-500/15"
                  style={{ left: '60%', width: '20%' }}
                />
                <div
                  className="bar-grow relative h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 shadow-[0_0_14px_rgb(14_165_233/0.45)]"
                  style={{ width: `${Math.max(2, Math.min(100, rate))}%` }}
                />
              </div>
              <div className="relative mt-1.5 h-4 text-2xs text-ink-4">
                <span className="absolute left-0">0%</span>
                <span className="absolute -translate-x-1/2" style={{ left: '70%' }}>
                  healthy 60&ndash;80%
                </span>
                <span className="absolute right-0">100%</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-3">
                {rebookingRate.rebookedWithin30Days} of {rebookingRate.completedVisits} visits led to a rebooking
                within 30 days.
              </p>
            </>
          )}
        </StatCard>

        <StatCard
          label="Revenue from rebooking reminders"
          tone="emerald"
          icon="chart"
          value={<CountUp value={revenueAttribution.totalAttributed} prefix="£" decimals={2} />}
          hint={`${revenueAttribution.attributedVisitCount} visit${
            revenueAttribution.attributedVisitCount === 1 ? '' : 's'
          } within 7 days of a reminder click. An estimate from click-to-visit timing, not perfect ground truth.`}
        />
      </div>

      <SectionCard
        className="mt-6"
        title="Customer health distribution"
        description="Based on recency, frequency and spend of visits (not click or review activity). Customers with no logged visits are excluded."
      >
        {healthTotal === 0 ? (
          <EmptyState
            icon="chart"
            title="No visit data yet"
            description="Once you log customer visits, you'll see how your customers split between thriving, steady, at-risk and lapsed."
            className="py-8"
          />
        ) : (
          <>
            <div
              className="flex h-3.5 overflow-hidden rounded-full bg-surface-muted"
              role="img"
              aria-label={tiers.map((tier) => `${tier.label}: ${healthTierCounts[tier.key]}`).join(', ')}
            >
              {tiers.map((tier) => {
                const count = healthTierCounts[tier.key];
                if (count === 0) return null;
                return (
                  <div
                    key={tier.key}
                    className={`bar-grow h-full border-r-2 border-surface last:border-r-0 ${tier.bar}`}
                    style={{ width: `${(count / healthTotal) * 100}%` }}
                  />
                );
              })}
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
              {tiers.map((tier) => {
                const count = healthTierCounts[tier.key];
                return (
                  <div key={tier.key}>
                    <dt className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                      <span className={`h-2 w-2 rounded-full ${tier.dot}`} aria-hidden="true" />
                      {tier.label}
                    </dt>
                    <dd className="mt-1.5 flex items-baseline gap-2">
                      <span className="text-3xl font-semibold tracking-[-0.03em] text-ink tabular-nums">{count}</span>
                      <span className="text-xs text-ink-3 tabular-nums">
                        {Math.round((count / healthTotal) * 100)}%
                      </span>
                    </dd>
                    <p className="mt-1 text-xs leading-5 text-ink-3">{tier.description}</p>
                  </div>
                );
              })}
            </dl>
          </>
        )}
      </SectionCard>
    </div>
  );
}
