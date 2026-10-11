'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyPoint, DistributionRow, GrowthPeriod } from '@/lib/google-review-analytics';

const BRAND = '#10b981';
const AMBER = '#f59e0b';
const STAR_COLORS: Record<number, string> = { 5: '#10b981', 4: '#84cc16', 3: '#f59e0b', 2: '#f97316', 1: '#ef4444' };

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtShort = (d: string) => shortDate.format(new Date(`${d}T00:00:00Z`));
const fmtLong = (d: string) => longDate.format(new Date(`${d}T00:00:00Z`));

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { value?: number | null; payload?: Record<string, unknown> }[];
};

function ChartTooltip({
  active,
  label,
  payload,
  render,
  formatLabel,
}: TooltipProps & { render: (p: Record<string, unknown>) => React.ReactNode; formatLabel?: (label: string) => string }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {label && formatLabel && <p className="mb-1 font-medium text-ink">{formatLabel(label)}</p>}
      <div className="text-ink-2">{render(payload[0].payload)}</div>
    </div>
  );
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-4 text-center text-sm text-ink-3">{children}</div>;
}

const AXIS_TICK = { fill: 'currentColor', fontSize: 12 };

// ---------------------------------------------------------------------------
// Review growth (total review count over time) with period switcher
// ---------------------------------------------------------------------------

const PERIOD_LABELS: Record<GrowthPeriod, string> = { month: 'Current month', '3m': 'Last 3 months', '12m': 'Last 12 months' };

export function ReviewGrowthChart({ series }: { series: Record<GrowthPeriod, DailyPoint[]> }) {
  const [period, setPeriod] = useState<GrowthPeriod>('3m');
  const data = series[period];
  const first = data[0]?.total ?? 0;
  const last = data[data.length - 1]?.total ?? 0;
  const hasData = last > 0;

  return (
    <div>
      <div role="tablist" aria-label="Review growth period" className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(PERIOD_LABELS) as GrowthPeriod[]).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={period === key}
            onClick={() => setPeriod(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              period === key ? 'bg-brand-500/15 text-brand-800 ring-1 ring-inset ring-brand-500/30 dark:text-brand-200' : 'text-ink-3 hover:bg-surface-muted hover:text-ink'
            }`}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
      </div>
      <div
        className="h-64 text-ink-4 sm:h-72"
        role="img"
        aria-label={`Review count over time, ${PERIOD_LABELS[period].toLowerCase()}: from ${first} to ${last} reviews.`}
      >
        {!hasData ? (
          <EmptyChart>No reviews yet. The chart fills in as reviews arrive.</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtShort} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={([min, max]: [number, number]) => [Math.max(0, min - 2), max + 2]}
              />
              <Tooltip
                content={(props) => (
                  <ChartTooltip
                    {...(props as TooltipProps)}
                    formatLabel={fmtLong}
                    render={(p) => (
                      <>
                        <p>
                          <span className="font-semibold text-ink">{String(p.total)}</span> reviews
                        </p>
                        {Number(p.gained) > 0 && <p>+{String(p.gained)} that day</p>}
                      </>
                    )}
                  />
                )}
              />
              <Area type="monotone" dataKey="total" stroke={BRAND} strokeWidth={2} fill="url(#growthFill)" name="Reviews" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Date on the horizontal axis, total review count on the vertical axis.
        {period === '12m' ? ' Shown week by week.' : ''}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Average rating trend
// ---------------------------------------------------------------------------

export function RatingTrendChart({ data }: { data: DailyPoint[] }) {
  const rated = data.filter((p) => p.average !== null);
  return (
    <div className="h-64 text-ink-4 sm:h-72" role="img" aria-label="Average rating over the selected period">
      {rated.length === 0 ? (
        <EmptyChart>No ratings in this period.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtShort} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={32} />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => v.toFixed(1)}
              domain={([min, max]: [number, number]) => [
                Math.max(1, Math.floor((min - 0.2) * 10) / 10),
                Math.min(5, Math.ceil((max + 0.2) * 10) / 10),
              ]}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  {...(props as TooltipProps)}
                  formatLabel={fmtLong}
                  render={(p) => (
                    <p>
                      <span className="font-semibold text-ink">{p.average === null ? '\u2014' : Number(p.average).toFixed(2)}</span>
                      {'\u2605'} average
                    </p>
                  )}
                />
              )}
            />
            <Line type="monotone" dataKey="average" stroke={AMBER} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} name="Average rating" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rating distribution
// ---------------------------------------------------------------------------

export function RatingDistributionChart({ rows }: { rows: DistributionRow[] }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  const data = rows.map((r) => ({ ...r, label: `${r.stars} ${r.stars === 1 ? 'Star' : 'Stars'}` }));

  return (
    <div>
      <div
        className="h-56 text-ink-3"
        role="img"
        aria-label={`Rating distribution: ${rows.map((r) => `${r.stars} stars ${r.count}`).join(', ')}`}
      >
        {total === 0 ? (
          <EmptyChart>No reviews in this period.</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }}>
              <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                cursor={{ fill: 'currentColor', fillOpacity: 0.06 }}
                content={(props) => (
                  <ChartTooltip
                    {...(props as TooltipProps)}
                    render={(p) => (
                      <p>
                        <span className="font-semibold text-ink">{String(p.count)}</span> {String(p.label).toLowerCase()} reviews
                      </p>
                    )}
                  />
                )}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22}>
                {data.map((row) => (
                  <Cell key={row.stars} fill={STAR_COLORS[row.stars]} />
                ))}
                <LabelList dataKey="count" position="right" fill="currentColor" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
