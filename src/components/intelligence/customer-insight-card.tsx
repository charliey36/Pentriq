import type { ChurnRisk, CustomerInsight } from '@/lib/intelligence/customer-insights';
import { Icon } from '@/components/ui/icons';
import { formatUKDate } from '@/lib/uk-defaults';

const RISK: Record<ChurnRisk, { label: string; className: string; bar: string }> = {
  new: { label: 'New', className: 'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300', bar: 'bg-sky-500' },
  low: { label: 'Low risk', className: 'bg-brand-500/10 text-brand-700 ring-brand-600/20 dark:text-brand-300', bar: 'bg-brand-500' },
  medium: { label: 'Medium risk', className: 'bg-amber-500/10 text-amber-700 ring-amber-600/25 dark:text-amber-300', bar: 'bg-amber-500' },
  high: { label: 'High risk', className: 'bg-orange-500/10 text-orange-700 ring-orange-600/25 dark:text-orange-300', bar: 'bg-orange-500' },
  lapsed: { label: 'Lapsed', className: 'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-300', bar: 'bg-rose-500' },
  unknown: { label: 'Unknown', className: 'bg-surface-muted text-ink-3 ring-line-strong/60', bar: 'bg-ink-4' },
};

/** "Pentriq summary" for one customer: narrative, churn risk with reasons, predicted next visit, next steps. */
export function CustomerInsightCard({ insight, actionsSlot }: { insight: CustomerInsight; actionsSlot?: React.ReactNode }) {
  const risk = RISK[insight.churnRisk];
  return (
    <section className="card relative overflow-hidden p-5 sm:p-6" aria-labelledby="customer-insight-title">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-brand-400/10 blur-3xl" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-brand-700 dark:text-brand-400">
            <Icon name="sparkles" className="h-3 w-3" />
            Pentriq summary
          </p>
          <h2 id="customer-insight-title" className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">{insight.headline}</h2>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${risk.className}`}>{risk.label}</span>
      </div>

      <div className="mt-3 space-y-1.5 text-[13px] leading-6 text-ink-2">
        {insight.narrative.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-surface-subtle px-3 py-2.5 ring-1 ring-inset ring-line">
          <dt className="text-2xs font-medium text-ink-4">Churn risk</dt>
          <dd className="mt-1">
            <span className="text-lg font-semibold tabular-nums text-ink">{insight.churnRisk === 'unknown' || insight.churnRisk === 'new' ? '—' : insight.churnScore}</span>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className={`bar-grow h-full rounded-full ${risk.bar}`} style={{ width: `${insight.churnScore}%` }} />
            </div>
          </dd>
        </div>
        <div className="rounded-xl bg-surface-subtle px-3 py-2.5 ring-1 ring-inset ring-line">
          <dt className="text-2xs font-medium text-ink-4">Predicted next visit</dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{insight.predictedNextVisit ? formatUKDate(insight.predictedNextVisit) : '—'}</dd>
          <dd className="text-2xs text-ink-4">
            {insight.cadenceBasis === 'personal' ? 'From their own rhythm' : insight.cadenceBasis === 'service' ? 'From the service interval' : 'Needs visit history'}
          </dd>
        </div>
        <div className="rounded-xl bg-surface-subtle px-3 py-2.5 ring-1 ring-inset ring-line">
          <dt className="text-2xs font-medium text-ink-4">Usual gap</dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{insight.cadenceDays ? `${insight.cadenceDays} days` : '—'}</dd>
          <dd className="text-2xs text-ink-4">{insight.daysSinceLastVisit !== null ? `${insight.daysSinceLastVisit} days since last` : 'No visits yet'}</dd>
        </div>
        <div className="rounded-xl bg-surface-subtle px-3 py-2.5 ring-1 ring-inset ring-line">
          <dt className="text-2xs font-medium text-ink-4">Average spend</dt>
          <dd className="mt-1 flex items-center gap-1 text-sm font-semibold text-ink">
            {insight.averageSpend !== null ? `£${insight.averageSpend.toLocaleString('en-GB')}` : '—'}
            {insight.spendTrend === 'up' && <Icon name="arrowUp" className="h-3.5 w-3.5 text-brand-600" strokeWidth={2.2} />}
            {insight.spendTrend === 'down' && <Icon name="arrowDown" className="h-3.5 w-3.5 text-rose-600" strokeWidth={2.2} />}
          </dd>
          <dd className="text-2xs text-ink-4">{insight.favouriteService ?? 'Per visit'}</dd>
        </div>
      </dl>

      {insight.churnReasons.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-ink-3">
          <span className="font-medium text-ink-2">Why: </span>
          {insight.churnReasons.join(' · ')}
        </p>
      )}

      {insight.actions.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="eyebrow text-ink-4">Recommended next</p>
          <ul className="mt-2 space-y-2">
            {insight.actions.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 text-[13px]">
                <Icon name="target" className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400" />
                <span>
                  <span className="font-semibold text-ink">{a.label}.</span> <span className="text-ink-3">{a.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {actionsSlot && <div className="mt-3">{actionsSlot}</div>}
        </div>
      )}
    </section>
  );
}
