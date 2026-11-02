import type { ReactNode } from 'react';
import { toneStyle, type Tone } from './tones';

/**
 * Horizontal meter: label, value and a filled track, with an optional target marker. Use for pillar scores,
 * shares and progress-to-goal. `value` is 0-100; null renders an empty, dashed "no data" track.
 */
export function Meter({
  label,
  value,
  display,
  tone = 'emerald',
  target,
  hint,
  size = 'md',
}: {
  label: ReactNode;
  value: number | null;
  /** What to print on the right; defaults to `${value}`. */
  display?: ReactNode;
  tone?: Tone;
  /** 0-100 position of a target tick. */
  target?: number;
  hint?: ReactNode;
  size?: 'sm' | 'md';
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const track = size === 'sm' ? 'h-1.5' : 'h-2';
  return (
    <div style={toneStyle(tone)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] font-medium text-ink-2">{label}</span>
        <span className="flex-shrink-0 text-[13px] font-semibold tabular-nums text-ink">
          {display ?? (value === null ? <span className="font-normal text-ink-4">No data</span> : value)}
        </span>
      </div>
      <div
        className={`relative mt-2 ${track} overflow-visible rounded-full ${value === null ? 'border border-dashed border-line-strong bg-transparent' : 'bg-surface-muted'}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        {value !== null && pct > 0 && (
          <div
            className="bar-grow h-full rounded-full"
            style={{ width: `${pct}%`, backgroundImage: 'linear-gradient(90deg, rgb(var(--tone)), rgb(var(--tone-deep)))' }}
          />
        )}
        {typeof target === 'number' && (
          <span
            aria-hidden="true"
            className="absolute -top-1 h-[calc(100%+8px)] w-0.5 rounded-full bg-ink-3/60"
            style={{ left: `calc(${Math.max(0, Math.min(100, target))}% - 1px)` }}
          />
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs leading-5 text-ink-3">{hint}</p>}
    </div>
  );
}
