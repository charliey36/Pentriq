import type { ReactNode } from 'react';

/**
 * Semicircular score gauge (0-100) for the Pentriq Health Score. The arc color follows the score band so the
 * state reads at a glance, and the number plus grade sit inside the arc. Server-renderable; the sweep-in
 * animation is CSS (`ring-anim`) and is disabled under prefers-reduced-motion.
 */
export function scoreColor(score: number | null): { from: string; to: string; text: string } {
  if (score === null) return { from: '#94a3b8', to: '#64748b', text: 'text-ink-3' };
  if (score >= 85) return { from: '#34d399', to: '#059669', text: 'text-brand-600 dark:text-brand-400' };
  if (score >= 70) return { from: '#5eead4', to: '#0d9488', text: 'text-teal-600 dark:text-teal-400' };
  if (score >= 55) return { from: '#fcd34d', to: '#d97706', text: 'text-amber-600 dark:text-amber-400' };
  if (score >= 40) return { from: '#fdba74', to: '#ea580c', text: 'text-orange-600 dark:text-orange-400' };
  return { from: '#fda4af', to: '#e11d48', text: 'text-rose-600 dark:text-rose-400' };
}

export function ScoreGauge({
  score,
  id,
  size = 220,
  stroke = 16,
  label,
  sublabel,
  children,
}: {
  score: number | null;
  id: string;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
  children?: ReactNode;
}) {
  const clamped = score === null ? 0 : Math.max(0, Math.min(100, score));
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const height = size / 2 + stroke;
  // Upper half-circle from 180° to 0°.
  const arc = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;
  const colors = scoreColor(score);
  const gradientId = `gauge-${id}`;

  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height }}
      role="img"
      aria-label={score === null ? 'Score not available yet' : `Score ${score} out of 100`}
    >
      <svg viewBox={`0 0 ${size} ${height}`} className="h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colors.from} />
            <stop offset="100%" stopColor={colors.to} />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-surface-muted" />
        {/* Tick marks at the grade boundaries. */}
        {[40, 55, 70, 85].map((t) => {
          const angle = Math.PI - (t / 100) * Math.PI;
          const inner = radius - stroke / 2 - 4;
          const outer = radius - stroke / 2 - 9;
          return (
            <line
              key={t}
              x1={cx + inner * Math.cos(angle)}
              y1={cy - inner * Math.sin(angle)}
              x2={cx + outer * Math.cos(angle)}
              y2={cy - outer * Math.sin(angle)}
              strokeWidth={1.5}
              className="stroke-line-strong"
            />
          );
        })}
        {clamped > 0 && (
          <path
            d={arc}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 - clamped}
            className="ring-anim"
            style={{ filter: `drop-shadow(0 6px 14px ${colors.to}55)` }}
          />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">
        {children ?? (
          <>
            <span className="text-[44px] font-semibold leading-none tracking-[-0.05em] text-ink tabular-nums">
              {score === null ? '—' : score}
            </span>
            {label && <span className={`mt-1.5 text-sm font-semibold ${colors.text}`}>{label}</span>}
            {sublabel && <span className="mt-0.5 text-xs text-ink-3">{sublabel}</span>}
          </>
        )}
      </div>
    </div>
  );
}
