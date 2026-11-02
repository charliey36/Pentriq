import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicConnection } from '@/lib/google-connection';
import { loadReputation } from '@/lib/reputation-data';
import { reviewsGainedBetween } from '@/lib/reputation-metrics';
import { dateKey } from '@/lib/google-review-analytics';
import { COUNTED_CLICK_TYPES, REVIEW_PURPOSES } from '@/lib/click-analytics';
import { fetchAll } from '@/lib/fetch-all';
import { loadIntelligence } from '@/lib/intelligence/load';
import {
  REPORT_PERIODS,
  buildKpis,
  executiveSummary,
  formatKpi,
  kpisToCsv,
  periodBounds,
  resolvePeriod,
  type Range,
  type ReportCounts,
} from '@/lib/intelligence/report';
import { PILLAR_LABELS } from '@/lib/intelligence/business-health';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedNav } from '@/components/ui/segmented-nav';
import { DeltaBadge } from '@/components/ui/delta-badge';
import { ScoreGauge } from '@/components/ui/score-gauge';
import { Icon } from '@/components/ui/icons';
import { formatUKDate, formatUKDateTime } from '@/lib/uk-defaults';
import { ReportActions } from './report-actions';

export const metadata: Metadata = { title: 'Executive report' };

type Db = ReturnType<typeof createClient>;

const head = async (q: PromiseLike<{ count: number | null }>) => {
  try {
    return (await q).count ?? 0;
  } catch {
    return 0;
  }
};

async function countsFor(db: Db, businessId: string, r: Range) {
  const from = r.from.toISOString();
  const to = r.to.toISOString();
  const [customers, sent, sentLegacy, clicksLegacy, clicks, feedback, visits, rebooking] = await Promise.all([
    head(db.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', from).lt('created_at', to)),
    head(db.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', businessId).in('purpose', [...REVIEW_PURPOSES]).eq('status', 'sent').gte('sent_at', from).lt('sent_at', to)),
    head(db.from('review_requests').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'sent').gte('sent_at', from).lt('sent_at', to)),
    head(db.from('click_events').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('clicked_at', from).lt('clicked_at', to)),
    head(db.from('interaction_events').select('id', { count: 'exact', head: true }).eq('business_id', businessId).in('event_type', [...COUNTED_CLICK_TYPES]).gte('occurred_at', from).lt('occurred_at', to)),
    db.from('private_feedback').select('rating').eq('business_id', businessId).gte('created_at', from).lt('created_at', to).limit(5000).then((r) => r.data ?? [], () => []),
    fetchAll((a, b) => db.from('visits').select('price').eq('business_id', businessId).gte('visited_at', from).lt('visited_at', to).order('id').range(a, b)).catch(() => [] as Array<{ price: number | null }>),
    head(db.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('purpose', 'rebooking_reminder').eq('status', 'sent').gte('sent_at', from).lt('sent_at', to)),
  ]);
  const ratings = feedback.map((f) => f.rating).filter((n): n is number => typeof n === 'number');
  return {
    customers,
    sent: sent + sentLegacy,
    clicks: clicks + clicksLegacy,
    feedback: feedback.length,
    rating: ratings.length ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 100) / 100 : null,
    visits: visits.length,
    revenue: Math.round(visits.reduce((s, v) => s + (v.price ?? 0), 0) * 100) / 100,
    rebooking,
  };
}

export default async function ReportsPage({ searchParams }: { searchParams?: { period?: string } }) {
  const business = await requireBusiness();
  const supabase = createClient();
  const period = resolvePeriod(searchParams?.period);
  const now = new Date();
  const bounds = periodBounds(period, now);
  const meta = REPORT_PERIODS[period];

  const connection = await getPublicConnection(business.id).catch(() => null);
  const googleActive = connection?.status === 'active' && Boolean(connection.google_location_id);

  const [current, previous, reputation, intel] = await Promise.all([
    countsFor(supabase, business.id, bounds.current),
    countsFor(supabase, business.id, bounds.previous),
    loadReputation(createAdminClient(), business.id, googleActive).catch(() => ({ source: 'manual' as const, snapshots: [] })),
    loadIntelligence(business),
  ]);

  const snaps = reputation.snapshots;
  const gained = (r: Range) => (snaps.length ? reviewsGainedBetween(snaps, dateKey(r.from), dateKey(r.to)) : null);

  const counts: ReportCounts = {
    newCustomers: [current.customers, previous.customers],
    requestsSent: [current.sent, previous.sent],
    clicks: [current.clicks, previous.clicks],
    feedbackReceived: [current.feedback, previous.feedback],
    feedbackRating: [current.rating, previous.rating],
    visits: [current.visits, previous.visits],
    revenue: [current.revenue, previous.revenue],
    rebookingReminders: [current.rebooking, previous.rebooking],
    reviewsGained: [gained(bounds.current), gained(bounds.previous)],
  };
  const kpis = buildKpis(counts);
  const businessName = business.name?.trim() || 'Your business';
  const summary = executiveSummary(kpis, businessName, meta.short);
  const csv = kpisToCsv(kpis, meta.label);
  const health = intel.health;

  return (
    <div>
      <PageHeader
        title="Executive report"
        icon="report"
        tone="sky"
        description="Period-over-period results in one page. Print it, save it as a PDF or export the numbers."
        actions={<ReportActions csv={csv} filename={`pentriq-report-${period}-${dateKey(now)}.csv`} />}
      />

      <SegmentedNav
        label="Report period"
        active={period}
        className="mb-6 print:hidden"
        items={(Object.keys(REPORT_PERIODS) as Array<keyof typeof REPORT_PERIODS>).map((key) => ({
          key,
          label: REPORT_PERIODS[key].label,
          href: `/reports?period=${key}`,
        }))}
      />

      <article className="card overflow-hidden" aria-labelledby="report-title">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-surface-subtle/60 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            {business.brand_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.brand_logo_url} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-line" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-lg font-semibold text-brand-700 dark:text-brand-300">
                {businessName.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <p className="eyebrow text-ink-4">Executive report · {meta.label}</p>
              <h2 id="report-title" className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">{businessName}</h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {formatUKDate(bounds.current.from)} – {formatUKDate(bounds.current.to)}, compared with {formatUKDate(bounds.previous.from)} – {formatUKDate(bounds.previous.to)}
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-4">Generated {formatUKDateTime(now)}</p>
        </header>

        <section className="border-b border-line px-6 py-6 sm:px-8" aria-labelledby="summary-title">
          <h3 id="summary-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="sparkles" className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            Summary
          </h3>
          <ul className="mt-3 space-y-2">
            {summary.map((line) => (
              <li key={line} className="flex gap-2.5 text-[15px] leading-7 text-ink-2">
                <span aria-hidden="true" className="mt-[11px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
                {line}
              </li>
            ))}
          </ul>
        </section>

        <section className="border-b border-line px-6 py-6 sm:px-8" aria-labelledby="kpi-title">
          <h3 id="kpi-title" className="text-sm font-semibold text-ink">Key results</h3>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
            {kpis.map((k) => (
              <div key={k.key} className="bg-surface p-4">
                <p className="text-xs font-medium text-ink-3">{k.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink tabular-nums">{formatKpi(k.current, k.format)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-ink-4">
                  <DeltaBadge pct={k.pct} current={k.current ?? 0} lowerIsBetter={k.lowerIsBetter} />
                  <span>was {formatKpi(k.previous, k.format)}</span>
                </div>
                {k.note && <p className="mt-1.5 text-2xs leading-4 text-ink-4">{k.note}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 border-b border-line px-6 py-6 sm:px-8 lg:grid-cols-[260px_1fr]" aria-labelledby="health-title">
          <div>
            <h3 id="health-title" className="text-sm font-semibold text-ink">Health score today</h3>
            <div className="mt-4">
              <ScoreGauge score={health.score} id="report-health" size={200} label={health.grade ? `Grade ${health.grade} · ${health.label}` : 'Not enough data'} />
            </div>
          </div>
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th className="text-right">Score</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {health.pillars.map((p) => (
                  <tr key={p.key}>
                    <td className="font-medium text-ink">{PILLAR_LABELS[p.key]}</td>
                    <td className="text-right tabular-nums">{p.score === null ? '—' : p.score}</td>
                    <td className="text-ink-3">{p.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="px-6 py-6 sm:px-8" aria-labelledby="priorities-title">
          <h3 id="priorities-title" className="text-sm font-semibold text-ink">Priorities for the next period</h3>
          {intel.actions.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-3">No open issues. Keep requests flowing and reply to feedback within two days.</p>
          ) : (
            <ol className="mt-3 space-y-2.5">
              {intel.actions.slice(0, 5).map((a, i) => (
                <li key={a.id} className="flex gap-3 text-[13px] leading-6">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink-2">{i + 1}</span>
                  <span>
                    <span className="font-semibold text-ink">{a.title}.</span> <span className="text-ink-3">{a.why}</span>
                    {a.impact && <span className="ml-1 font-medium text-brand-700 dark:text-brand-300">{a.impact}.</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="border-t border-line bg-surface-subtle/60 px-6 py-4 text-2xs leading-5 text-ink-4 sm:px-8">
          Clicks are counted review-link clicks (bots and link scanners excluded), not confirmed Google reviews. New public reviews come from{' '}
          {reputation.source === 'google' ? 'your connected Google Business Profile' : 'the review counts you record in Reputation settings'}. Revenue is the sum of visit
          prices logged in Pentriq.
        </footer>
      </article>
    </div>
  );
}
