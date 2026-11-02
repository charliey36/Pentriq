import { SectionCard } from '@/components/ui/section-card';
import type { ImpactSummary } from '@/lib/impact';

export function ImpactCard({ summary, attributedRevenue, reviewsCompleted, monthlyPrice, currency }: { summary: ImpactSummary; attributedRevenue: number; reviewsCompleted: number; monthlyPrice: number; currency: string }) {
  return (
    <SectionCard className="reveal" title="Your return on Pentriq" description="Estimates from your own data. A visit shortly after a reminder click may have happened anyway.">
      <p className="text-[15px] leading-7 text-ink-2">{summary.headline}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-subtle p-4 ring-1 ring-inset ring-line">
          <p className="text-xs text-ink-3">Revenue after reminders (est.)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{currency}{Math.round(attributedRevenue).toLocaleString('en-GB')}</p>
        </div>
        <div className="rounded-xl bg-surface-subtle p-4 ring-1 ring-inset ring-line">
          <p className="text-xs text-ink-3">Customers who followed your review link</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{reviewsCompleted.toLocaleString('en-GB')}</p>
        </div>
        <div className="rounded-xl bg-surface-subtle p-4 ring-1 ring-inset ring-line">
          <p className="text-xs text-ink-3">Your plan</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{currency}{monthlyPrice}<span className="text-sm font-normal text-ink-3"> / month</span></p>
          {summary.multiple !== null && <p className="mt-0.5 text-[11px] text-ink-4">{summary.paidForItself ? `Estimated ${summary.multiple}× what you have paid` : 'Not yet covering its cost'}</p>}
        </div>
      </div>
      {summary.nextStep && <p className="mt-4 text-sm text-ink-3">Next: {summary.nextStep}</p>}
    </SectionCard>
  );
}
