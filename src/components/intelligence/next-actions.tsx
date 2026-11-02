import Link from 'next/link';
import type { ActionPriority, NextAction } from '@/lib/intelligence/next-best-actions';
import { Icon } from '@/components/ui/icons';
import { toneStyle, type Tone } from '@/components/ui/tones';

const PRIORITY: Record<ActionPriority, { label: string; tone: Tone; pill: string }> = {
  urgent: { label: 'Urgent', tone: 'rose', pill: 'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-300' },
  high: { label: 'High', tone: 'amber', pill: 'bg-amber-500/10 text-amber-700 ring-amber-600/25 dark:text-amber-300' },
  medium: { label: 'Medium', tone: 'sky', pill: 'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300' },
  low: { label: 'Low', tone: 'slate', pill: 'bg-surface-muted text-ink-3 ring-line-strong/70' },
};

/**
 * Ranked "do this next" list. Each item says what, why, what it's worth (when measurable) and links to the
 * exact place the work gets done. `limit` trims for compact placements; the rest are counted, not hidden.
 */
export function NextActions({
  actions,
  limit,
  emptyTitle = 'You are on top of everything',
  className = '',
}: {
  actions: NextAction[];
  limit?: number;
  emptyTitle?: string;
  className?: string;
}) {
  const shown = typeof limit === 'number' ? actions.slice(0, limit) : actions;
  const hidden = actions.length - shown.length;

  return (
    <section className={`card overflow-hidden ${className}`} aria-labelledby="next-actions-title">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 id="next-actions-title" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink">
            <Icon name="sparkles" className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            Next best actions
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-ink-3">Ranked from your own numbers. Each one links to where it gets done.</p>
        </div>
        {actions.length > 0 && (
          <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums text-ink-2">{actions.length}</span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <Icon name="checkCircle" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{emptyTitle}</p>
            <p className="text-[13px] text-ink-3">Nothing needs your attention right now. We will flag anything new here.</p>
          </div>
        </div>
      ) : (
        <ol className="divide-y divide-line/70">
          {shown.map((action, index) => {
            const p = PRIORITY[action.priority];
            return (
              <li key={action.id} className="animate-fade-in" style={{ animationDelay: `${index * 40}ms` }}>
                <Link href={action.href} className="group flex items-start gap-3.5 px-5 py-4 transition-colors duration-150 hover:bg-brand-500/[0.05] sm:px-6">
                  <span style={toneStyle(p.tone)} className="tone-tile mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl">
                    <Icon name={action.icon} className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{action.title}</span>
                      <span className={`rounded-full px-2 py-px text-2xs font-semibold ring-1 ring-inset ${p.pill}`}>{p.label}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-ink-3">{action.why}</span>
                    {action.impact && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-brand-500/[0.08] px-2 py-0.5 text-xs font-medium text-brand-800 dark:text-brand-300">
                        <Icon name="trendingUp" className="h-3.5 w-3.5" />
                        {action.impact}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 hidden flex-shrink-0 items-center gap-1 text-[13px] font-medium text-brand-700 group-hover:text-brand-800 dark:text-brand-400 sm:inline-flex">
                    {action.cta}
                    <Icon name="arrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {hidden > 0 && (
        <Link href="/insights" className="block border-t border-line px-5 py-3 text-center text-[13px] font-medium text-brand-700 hover:bg-surface-muted/60 dark:text-brand-400 sm:px-6">
          See {hidden} more in Insights
        </Link>
      )}
    </section>
  );
}
