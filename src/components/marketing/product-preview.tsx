import { LogoMark } from '@/components/logo';
import { APP_NAME_ACCENT, APP_NAME_LEAD } from '@/lib/brand';
import { areaFromLine, smoothLinePath, type Point } from '@/lib/chart';
import { Icon, type IconName } from '@/components/ui/icons';
import { Sparkline } from '@/components/ui/sparkline';
import { toneRgb, toneStyle, type Tone } from '@/components/ui/tones';

/*
 * Static, illustrative product screenshot built from the same tokens and
 * classes as the real app (tone tiles, tinted KPI cards, gradient hero), so
 * marketing visuals never drift from the product. All numbers are sample data
 * (and labelled as such where it is shown).
 */

const navItems: { label: string; icon: IconName; active?: boolean }[] = [
  { label: 'Dashboard', icon: 'dashboard', active: true },
  { label: 'Analytics', icon: 'chart' },
  { label: 'Customers', icon: 'users' },
  { label: 'Segments', icon: 'funnel' },
  { label: 'Referrals', icon: 'userPlus' },
  { label: 'Feedback', icon: 'chat' },
];

const kpis: { label: string; value: string; delta: string; tone: Tone; icon: IconName; series: number[] }[] = [
  { label: 'Customers', value: '248', delta: '+12%', tone: 'emerald', icon: 'users', series: [3, 4, 3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 8, 11] },
  { label: 'Requests sent', value: '212', delta: '+18%', tone: 'sky', icon: 'mail', series: [2, 3, 3, 4, 3, 5, 4, 6, 5, 7, 6, 8, 9, 10] },
  { label: 'Link clicks', value: '97', delta: '+9%', tone: 'violet', icon: 'cursor', series: [1, 2, 1, 3, 2, 3, 3, 4, 3, 5, 4, 5, 6, 6] },
  { label: 'Click-through', value: '45.8%', delta: '+3.1%', tone: 'amber', icon: 'chart', series: [4, 5, 4, 6, 5, 6, 7, 6, 7, 8, 7, 8, 8, 9] },
];

const recent = [
  { name: 'Maya Patel', status: 'Sent', dot: 'bg-brand-500' },
  { name: 'Daniel Okafor', status: 'Sent', dot: 'bg-brand-500' },
  { name: 'Sofia Rossi', status: 'Pending', dot: 'bg-amber-500' },
  { name: 'Liam Chen', status: 'Sent', dot: 'bg-brand-500' },
];

// Two smooth sample series for the activity chart, generated with the same
// path helpers the real chart uses.
function chartPaths() {
  const W = 360;
  const H = 96;
  const build = (data: number[]) => {
    const max = 12;
    const points: Point[] = data.map((value, index) => ({
      x: 4 + (index / (data.length - 1)) * (W - 8),
      y: 6 + (1 - value / max) * (H - 12),
    }));
    const line = smoothLinePath(points, 4, H - 4);
    return { line, area: areaFromLine(line, points, H - 4) };
  };
  return {
    W,
    H,
    sent: build([3, 4, 3, 5, 6, 5, 7, 6, 8, 7, 9, 8, 10, 11]),
    clicks: build([1, 2, 1, 2, 3, 2, 3, 3, 4, 3, 4, 5, 5, 6]),
  };
}

export function ProductPreview({ className = '' }: { className?: string }) {
  const chart = chartPaths();

  return (
    <div
      aria-hidden="true"
      className={`overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-float ${className}`}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-line bg-surface-subtle px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </span>
        <span className="mx-auto flex h-6 w-full max-w-[220px] items-center justify-center gap-1.5 rounded-md bg-surface-muted text-2xs font-medium text-ink-3">
          <Icon name="lock" className="h-3 w-3" />
          Pentriq &middot; Dashboard
        </span>
        <span className="w-10" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-44 flex-shrink-0 flex-col border-r border-line bg-surface-sidebar p-3 md:flex">
          <div className="flex items-center gap-2 px-1.5 pb-3 pt-1">
            <LogoMark className="h-6 w-6" />
            <span className="text-[13px] font-semibold tracking-[-0.02em] text-ink">
              {APP_NAME_LEAD}<span className="text-brand-700 dark:text-brand-400">{APP_NAME_ACCENT}</span>
            </span>
          </div>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li
                key={item.label}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium ${
                  item.active
                    ? 'bg-gradient-to-r from-brand-500/[0.18] to-transparent text-brand-800 ring-1 ring-inset ring-brand-500/20 dark:text-brand-200'
                    : 'text-ink-3'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md ${
                    item.active ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white' : 'text-ink-4'
                  }`}
                >
                  <Icon name={item.icon} className="h-3 w-3" />
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-2.5 bg-app p-3.5 sm:p-4">
          <div
            className="relative isolate overflow-hidden rounded-xl p-4 text-white"
            style={{ backgroundImage: 'linear-gradient(135deg, #064e3b 0%, #065f46 28%, #0f766e 66%, #0e7490 100%)' }}
          >
            <div aria-hidden="true" className="absolute -right-10 -top-14 -z-10 h-40 w-40 rounded-full bg-emerald-300/30 blur-2xl" />
            <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-emerald-100/75">Overview</p>
            <p className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">Welcome back, Harbor Barbers</p>
            <p className="mt-0.5 text-2xs text-emerald-50/80">212 review requests sent &middot; 45.8% clicked through</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {kpis.map((kpi, index) => (
              <div
                key={kpi.label}
                style={toneStyle(kpi.tone)}
                className="tone-wash rounded-xl border border-line bg-surface p-3 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <p className="text-2xs font-medium text-ink-3">{kpi.label}</p>
                  <span className="tone-tile flex h-5 w-5 items-center justify-center rounded-md">
                    <Icon name={kpi.icon} className="h-3 w-3" />
                  </span>
                </div>
                <p className="mt-1.5 text-[22px] font-semibold leading-6 tracking-[-0.035em] text-ink tabular-nums">
                  {kpi.value}
                </p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-2xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20 dark:text-brand-300">
                    <Icon name="arrowUp" className="h-2.5 w-2.5" strokeWidth={2.6} />
                    {kpi.delta}
                  </span>
                  <Sparkline data={kpi.series} id={`preview-${index}`} tone={kpi.tone} className="h-6 w-14" />
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-2.5 lg:grid-cols-5">
            <div className="rounded-xl border border-line bg-surface p-3.5 shadow-card lg:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink">Activity</p>
                <p className="flex items-center gap-3 text-2xs text-ink-3">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(${toneRgb('emerald')})` }} />
                    Sent
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(${toneRgb('violet')})` }} />
                    Clicks
                  </span>
                </p>
              </div>
              <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="mt-2 block h-auto w-full">
                <defs>
                  <linearGradient id="pv-sent" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={`rgb(${toneRgb('emerald')})`} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={`rgb(${toneRgb('emerald')})`} stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="pv-clicks" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={`rgb(${toneRgb('violet')})`} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={`rgb(${toneRgb('violet')})`} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={chart.sent.area} fill="url(#pv-sent)" />
                <path d={chart.sent.line} fill="none" stroke={`rgb(${toneRgb('emerald')})`} strokeWidth="2.25" strokeLinecap="round" />
                <path d={chart.clicks.area} fill="url(#pv-clicks)" />
                <path d={chart.clicks.line} fill="none" stroke={`rgb(${toneRgb('violet')})`} strokeWidth="2.25" strokeLinecap="round" />
              </svg>
            </div>

            <div className="rounded-xl border border-line bg-surface shadow-card lg:col-span-2">
              <p className="border-b border-line px-3.5 py-2.5 text-xs font-semibold text-ink">Recent customers</p>
              <ul className="divide-y divide-line">
                {recent.map((row) => (
                  <li key={row.name} className="flex items-center gap-2 px-3.5 py-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-muted text-2xs font-semibold text-ink-2">
                      {row.name[0]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-2xs font-medium text-ink">{row.name}</span>
                    <span className="inline-flex items-center gap-1 text-2xs text-ink-3">
                      <span className={`h-1.5 w-1.5 rounded-full ${row.dot}`} />
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
