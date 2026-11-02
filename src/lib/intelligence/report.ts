/**
 * Executive report: period-over-period KPIs and a plain-English summary an owner can print, save as PDF or
 * forward to a partner or accountant. Pure functions; the page does the querying.
 */
import { compare } from '@/lib/intelligence/forecast';
import { csvCell } from '@/lib/account-export';

export const REPORT_PERIODS = {
  '30d': { label: 'Last 30 days', short: '30 days', days: 30 },
  '90d': { label: 'Last 90 days', short: '90 days', days: 90 },
  '12m': { label: 'Last 12 months', short: '12 months', days: 365 },
} as const;
export type ReportPeriod = keyof typeof REPORT_PERIODS;

export function resolvePeriod(value: string | undefined | null): ReportPeriod {
  return value && value in REPORT_PERIODS ? (value as ReportPeriod) : '30d';
}

export type Range = { from: Date; to: Date };

/** Current period ends now; the previous period is the same length immediately before it. */
export function periodBounds(period: ReportPeriod, now: Date = new Date()): { current: Range; previous: Range } {
  const days = REPORT_PERIODS[period].days;
  const to = new Date(now);
  const from = new Date(now.getTime() - days * 86_400_000);
  const prevFrom = new Date(from.getTime() - days * 86_400_000);
  return { current: { from, to }, previous: { from: prevFrom, to: from } };
}

export type KpiFormat = 'number' | 'currency' | 'percent' | 'rating';

export type Kpi = {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  format: KpiFormat;
  lowerIsBetter?: boolean;
  /** % change vs previous; null when there is no baseline. */
  pct: number | null;
  note?: string;
};

export type ReportCounts = {
  newCustomers: [number, number];
  requestsSent: [number, number];
  clicks: [number, number];
  feedbackReceived: [number, number];
  /** Average private-feedback rating, null when none had a rating. */
  feedbackRating: [number | null, number | null];
  visits: [number, number];
  revenue: [number, number];
  rebookingReminders: [number, number];
  /** Public reviews gained (null without reputation data). */
  reviewsGained: [number | null, number | null];
};

function kpi(key: string, label: string, pair: [number | null, number | null], format: KpiFormat, extra: Partial<Kpi> = {}): Kpi {
  const [current, previous] = pair;
  const pct = current !== null && previous !== null ? compare(current, previous).pct : null;
  return { key, label, current, previous, format, pct, ...extra };
}

export function buildKpis(c: ReportCounts): Kpi[] {
  const ctr = (clicks: number, sent: number) => (sent > 0 ? Math.round((clicks / sent) * 1000) / 10 : null);
  const ctrPair: [number | null, number | null] = [ctr(c.clicks[0], c.requestsSent[0]), ctr(c.clicks[1], c.requestsSent[1])];
  const ctrKpi = kpi('ctr', 'Click-through rate', ctrPair, 'percent');
  // For a rate, the change worth showing is in percentage points, not a % of a %.
  if (ctrPair[0] !== null && ctrPair[1] !== null) ctrKpi.pct = Math.round((ctrPair[0] - ctrPair[1]) * 10) / 10;
  ctrKpi.note = 'Change shown in percentage points';

  return [
    kpi('reviews', 'New public reviews', c.reviewsGained, 'number', { note: c.reviewsGained[0] === null ? 'Connect Google or record your numbers in Reputation settings' : undefined }),
    kpi('requests', 'Review requests sent', c.requestsSent, 'number'),
    kpi('clicks', 'Review-link clicks', c.clicks, 'number'),
    ctrKpi,
    kpi('customers', 'New customers', c.newCustomers, 'number'),
    kpi('visits', 'Visits logged', c.visits, 'number'),
    kpi('revenue', 'Revenue logged', c.revenue, 'currency', { note: 'Sum of visit prices recorded in Pentriq' }),
    kpi('rebooking', 'Rebooking reminders sent', c.rebookingReminders, 'number'),
    kpi('feedback', 'Private feedback received', c.feedbackReceived, 'number'),
    kpi('feedbackRating', 'Average private rating', c.feedbackRating, 'rating'),
  ];
}

export function formatKpi(value: number | null, format: KpiFormat): string {
  if (value === null) return '—';
  switch (format) {
    case 'currency':
      return `£${Math.round(value).toLocaleString('en-GB')}`;
    case 'percent':
      return `${value.toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`;
    case 'rating':
      return `${value.toFixed(1)}★`;
    default:
      return value.toLocaleString('en-GB');
  }
}

/** Three to five short sentences: the headline result, the biggest mover, and what needs attention. */
export function executiveSummary(kpis: Kpi[], businessName: string, periodShort: string): string[] {
  const by = (key: string) => kpis.find((k) => k.key === key);
  const lines: string[] = [];
  const name = businessName.trim() || 'Your business';
  const requests = by('requests');
  const clicks = by('clicks');
  const reviews = by('reviews');
  const revenue = by('revenue');
  const feedback = by('feedback');

  if (requests?.current) {
    lines.push(
      `${name} sent ${formatKpi(requests.current, 'number')} review request${requests.current === 1 ? '' : 's'} in the last ${periodShort}` +
        (clicks?.current ? `, and customers clicked through ${formatKpi(clicks.current, 'number')} time${clicks.current === 1 ? '' : 's'}.` : '.')
    );
  } else {
    lines.push(`${name} sent no review requests in the last ${periodShort}. Importing recent customers or connecting a booking system restarts the flow.`);
  }

  if (reviews?.current !== null && reviews?.current !== undefined) {
    lines.push(
      reviews.pct !== null && reviews.previous
        ? `You gained ${reviews.current} public review${reviews.current === 1 ? '' : 's'}, ${reviews.pct >= 0 ? 'up' : 'down'} ${Math.abs(reviews.pct)}% on the period before.`
        : `You gained ${reviews.current} public review${reviews.current === 1 ? '' : 's'}.`
    );
  }

  // Biggest mover among volume metrics with a real baseline.
  const movers = kpis
    .filter((k) => k.pct !== null && k.previous && k.format !== 'percent' && k.format !== 'rating' && k.key !== 'reviews')
    .sort((a, b) => Math.abs(b.pct as number) - Math.abs(a.pct as number));
  const top = movers[0];
  if (top && Math.abs(top.pct as number) >= 10) {
    lines.push(`${top.label} ${(top.pct as number) > 0 ? 'rose' : 'fell'} ${Math.abs(top.pct as number)}% (${formatKpi(top.previous, top.format)} → ${formatKpi(top.current, top.format)}).`);
  }

  if (revenue?.current) {
    lines.push(`Visits worth ${formatKpi(revenue.current, 'currency')} were logged in Pentriq over the period.`);
  }

  if (feedback?.current) {
    const rating = by('feedbackRating');
    lines.push(
      `${feedback.current} customer${feedback.current === 1 ? '' : 's'} shared private feedback${rating?.current ? `, averaging ${formatKpi(rating.current, 'rating')}` : ''}.`
    );
  }

  return lines.slice(0, 5);
}

/** Numbers are written raw (so a negative change isn't formula-escaped); text goes through the shared safe writer. */
export function kpisToCsv(kpis: Kpi[], periodLabel: string): string {
  const cell = (v: string | number | null) => (typeof v === 'number' ? String(v) : csvCell(v));
  const rows: Array<Array<string | number | null>> = [
    ['Metric', periodLabel, 'Previous period', 'Change %'],
    ...kpis.map((k) => [k.label, k.current, k.previous, k.pct]),
  ];
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
