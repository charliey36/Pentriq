import { Icon } from './icons';

/**
 * Period-over-period change pill: arrow for direction, color for whether that direction is good.
 * `pct` null (no baseline) shows "New" when there's a current value, otherwise nothing.
 */
export function DeltaBadge({
  pct,
  current,
  lowerIsBetter = false,
  className = '',
}: {
  pct: number | null;
  current?: number;
  lowerIsBetter?: boolean;
  className?: string;
}) {
  if (pct === null) {
    if (!current) return null;
    return (
      <span className={`inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 text-2xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:text-sky-300 ${className}`}>
        New
      </span>
    );
  }
  const direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const good = direction === 'flat' ? null : lowerIsBetter ? direction === 'down' : direction === 'up';
  const tone =
    good === null
      ? 'bg-surface-muted text-ink-3 ring-line-strong/60'
      : good
        ? 'bg-brand-500/10 text-brand-700 ring-brand-600/20 dark:text-brand-300'
        : 'bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300';
  const label = `${pct > 0 ? '+' : ''}${Math.abs(pct) >= 100 ? Math.round(pct) : pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums ring-1 ring-inset ${tone} ${className}`}
      aria-label={`${direction === 'flat' ? 'No change' : `${direction === 'up' ? 'Up' : 'Down'} ${Math.abs(pct)}%`} vs previous period`}
    >
      {direction !== 'flat' && <Icon name={direction === 'up' ? 'arrowUp' : 'arrowDown'} className="h-3 w-3" strokeWidth={2.2} />}
      {label}
    </span>
  );
}
