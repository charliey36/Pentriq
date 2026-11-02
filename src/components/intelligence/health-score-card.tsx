import Link from 'next/link';
import type { HealthReport, PillarKey } from '@/lib/intelligence/business-health';
import { TARGETS } from '@/lib/intelligence/business-health';
import { ScoreGauge } from '@/components/ui/score-gauge';
import { Meter } from '@/components/ui/meter';
import { Icon } from '@/components/ui/icons';
import type { Tone } from '@/components/ui/tones';

const PILLAR_TONES: Record<PillarKey, Tone> = {
  foundations: 'slate',
  reach: 'sky',
  reputation: 'amber',
  responsiveness: 'rose',
  retention: 'violet',
};

/**
 * The Pentriq Health Score: gauge, five explainable pillars and the single best next improvement.
 * `compact` drops the pillar list (dashboard sidebar use).
 */
export function HealthScoreCard({ report, compact = false, className = '' }: { report: HealthReport; compact?: boolean; className?: string }) {
  const focus = report.weakest ?? report.pillars.find((p) => p.score === null) ?? null;

  return (
    <section className={`card relative overflow-hidden p-5 sm:p-6 ${className}`} aria-labelledby="health-score-title">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-ink-4">Pentriq Health Score</p>
          <h2 id="health-score-title" className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">
            {report.score === null ? 'Building your baseline' : `${report.label} · grade ${report.grade}`}
          </h2>
        </div>
        <Link href="/insights" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:text-brand-800 dark:text-brand-400">
          Details <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>

      <div className={`mt-4 ${compact ? '' : 'grid gap-6 md:grid-cols-[minmax(0,240px)_1fr] md:items-center'}`}>
        <div>
          <ScoreGauge
            score={report.score}
            id={compact ? 'health-compact' : 'health-full'}
            size={compact ? 190 : 220}
            label={report.grade ? `Grade ${report.grade}` : 'Not enough data'}
            sublabel={`${report.coverage} of 5 areas measured`}
          />
        </div>

        {!compact && (
          <ul className="space-y-4">
            {report.pillars.map((pillar) => (
              <li key={pillar.key}>
                <Meter
                  label={pillar.label}
                  value={pillar.score}
                  tone={PILLAR_TONES[pillar.key]}
                  target={pillar.key === 'foundations' ? 100 : 70}
                  hint={pillar.detail}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {focus && (
        <Link
          href={focus.href}
          className="group mt-5 flex items-start gap-3 rounded-xl border border-brand-500/20 bg-brand-500/[0.06] px-4 py-3 transition-colors hover:bg-brand-500/10"
        >
          <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-700 dark:text-brand-300">
            <Icon name="target" className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-2xs font-semibold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
              Biggest lift: {focus.label}
            </span>
            <span className="mt-0.5 block text-[13px] leading-5 text-ink-2">{focus.tip}</span>
          </span>
          <Icon name="chevronRight" className="mt-1.5 h-4 w-4 flex-shrink-0 text-ink-4 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
        </Link>
      )}

      {!compact && (
        <p className="mt-4 text-xs leading-5 text-ink-4">
          Targets: {TARGETS.monthlyRequests} requests and {TARGETS.monthlyReviews} new reviews a month, {TARGETS.clickThroughPct}% click-through,{' '}
          {TARGETS.rebookingRatePct}% rebooking within 30 days, replies to {TARGETS.replyRatePct}% of reviews. Areas without data are left out rather than scored zero.
        </p>
      )}
    </section>
  );
}
