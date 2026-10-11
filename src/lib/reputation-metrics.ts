import {
  addDays,
  addMonths,
  daysBetween,
  monthKey,
  monthStart,
  previousMonthEnd,
  statsAsOf,
  type ResolvedRange,
  type SnapshotLite,
} from '@/lib/google-review-analytics';

/**
 * Source-agnostic reputation maths (pure). Everything works from daily
 * snapshots {date, total, average}: manual entries today, Google's
 * `review_metrics_daily` once the integration is live, so the dashboard
 * doesn't care where the numbers came from.
 */

export type ManualSnapshotRow = { snapshot_date: string; review_count: number; average_rating: number };

const round = (n: number, dp: number) => Math.round((n + Number.EPSILON) * 10 ** dp) / 10 ** dp;

/** Manual entries -> daily snapshots. `reviews_gained_today` is the increase since the previous entry (never negative). */
export function toSnapshots(rows: ManualSnapshotRow[]): SnapshotLite[] {
  const sorted = [...rows].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  return sorted.map((r, i) => ({
    date: r.snapshot_date,
    total_reviews: r.review_count,
    average_rating: Number(r.average_rating),
    reviews_gained_today: i === 0 ? 0 : Math.max(0, r.review_count - sorted[i - 1].review_count),
  }));
}

export function validateSnapshot(input: { date: string; count: number; rating: number }, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || addDays(input.date, 0) !== input.date) return 'Choose a valid date.';
  if (input.date > today) return 'The date cannot be in the future.';
  if (!Number.isInteger(input.count) || input.count < 0 || input.count > 10_000_000) return 'Review count must be a whole number of 0 or more.';
  if (!Number.isFinite(input.rating) || input.rating < 0 || input.rating > 5) return 'Average rating must be between 0 and 5.';
  if (input.count > 0 && input.rating < 1) return 'Average rating must be between 1 and 5 when you have reviews.';
  return null;
}

/** Reviews gained over [from, to]. The first snapshot is the baseline when the range starts before it. Null if no data yet. */
export function reviewsGainedBetween(snaps: SnapshotLite[], from: string, to: string): number | null {
  if (snaps.length === 0) return null;
  const first = [...snaps].sort((a, b) => a.date.localeCompare(b.date))[0];
  if (first.date > to) return null;
  const end = statsAsOf(snaps, [], to);
  const hasBefore = snaps.some((s) => s.date <= addDays(from, -1));
  const startTotal = hasBefore ? statsAsOf(snaps, [], addDays(from, -1)).total : first.total_reviews;
  return Math.max(0, end.total - startTotal);
}

/** Average-rating change over [from, to]; null when there is no earlier snapshot to compare with. */
export function ratingChangeBetween(snaps: SnapshotLite[], from: string, to: string): number | null {
  if (!snaps.some((s) => s.date <= addDays(from, -1))) return null;
  const start = statsAsOf(snaps, [], addDays(from, -1)).average;
  const end = statsAsOf(snaps, [], to).average;
  return start === null || end === null ? null : round(end - start, 2);
}

/** Percentage change in review pace (per day). Null when there is no earlier pace to compare against. */
export function velocityPercent(prevGained: number, prevDays: number, curGained: number, curDays: number): number | null {
  if (prevDays <= 0 || curDays <= 0) return null;
  const prev = prevGained / prevDays;
  const cur = curGained / curDays;
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round((cur / prev - 1) * 100);
}

export type Reputation = {
  hasData: boolean;
  averageRating: number | null;
  totalReviews: number;
  gainedThisMonth: number;
  gainedLastMonth: number;
  ratingChange: number | null;
  /** Pace vs last month, percent. Null = no earlier month to compare. */
  velocity: number | null;
};

export function computeReputation(snaps: SnapshotLite[], today: string): Reputation {
  const now = statsAsOf(snaps, [], today);
  const lmEnd = previousMonthEnd(today);
  const lmStart = monthStart(lmEnd);
  const thisGained = reviewsGainedBetween(snaps, monthStart(today), today) ?? 0;
  const lastGained = reviewsGainedBetween(snaps, lmStart, lmEnd);
  const hasLastMonthData = snaps.some((s) => s.date <= lmEnd);
  const curDays = daysBetween(monthStart(today), today) + 1;
  const lastDays = daysBetween(lmStart, lmEnd) + 1;
  return {
    hasData: snaps.length > 0,
    averageRating: now.average,
    totalReviews: now.total,
    gainedThisMonth: thisGained,
    gainedLastMonth: lastGained ?? 0,
    ratingChange: ratingChangeBetween(snaps, monthStart(today), today),
    velocity: hasLastMonthData ? velocityPercent(lastGained ?? 0, lastDays, thisGained, curDays) : null,
  };
}

export type MonthPoint = { month: string; gained: number; total: number; average: number | null; velocity: number | null };

/** Last `months` calendar months that have data: gained per month and month-over-month pace change. */
export function monthlySeries(snaps: SnapshotLite[], today: string, months = 12): MonthPoint[] {
  if (snaps.length === 0) return [];
  const firstMonth = monthKey([...snaps].sort((a, b) => a.date.localeCompare(b.date))[0].date);
  const out: MonthPoint[] = [];
  let prev: { gained: number; days: number } | null = null;
  for (let i = months - 1; i >= 0; i -= 1) {
    const ms = monthStart(addMonths(today, -i));
    if (monthKey(ms) < firstMonth) continue;
    const last = addDays(addMonths(ms, 1), -1);
    const end = last > today ? today : last;
    const gained = reviewsGainedBetween(snaps, ms, end) ?? 0;
    const days = daysBetween(ms, end) + 1;
    const stats = statsAsOf(snaps, [], end);
    out.push({
      month: monthKey(ms),
      gained,
      total: stats.total,
      average: stats.average,
      velocity: prev ? velocityPercent(prev.gained, prev.days, gained, days) : null,
    });
    prev = { gained, days };
  }
  return out;
}

/** Rows for the `review_metrics` roll-up table. */
export function monthlyMetrics(snaps: SnapshotLite[], today: string) {
  return monthlySeries(snaps, today, 120).map((m, i, all) => ({
    period: m.month,
    reviews_gained: m.gained,
    review_count: m.total,
    average_rating: m.average ?? 0,
    rating_change: i > 0 && m.average !== null && all[i - 1].average !== null ? round(m.average - (all[i - 1].average as number), 2) : 0,
  }));
}

export type Insight = { text: string; tone: 'good' | 'bad' | 'neutral' };

function periodPhrase(range: ResolvedRange): string {
  const days = daysBetween(range.from, range.to) + 1;
  if (range.key === 'custom') return `${range.from} to ${range.to}`;
  return range.key === '12m' ? 'the last 12 months' : `the last ${days} days`;
}

/** Plain-English insights comparing the selected period with the equally long period before it. */
export function generateInsights(snaps: SnapshotLite[], range: ResolvedRange): Insight[] {
  if (snaps.length === 0) {
    return [{ text: 'Add your first snapshot in Settings \u2192 Reputation Tracking to start generating insights.', tone: 'neutral' }];
  }
  const days = daysBetween(range.from, range.to) + 1;
  const prevFrom = addDays(range.from, -days);
  const prevTo = addDays(range.from, -1);
  const phrase = periodPhrase(range);
  const gained = reviewsGainedBetween(snaps, range.from, range.to);
  const prevGained = reviewsGainedBetween(snaps, prevFrom, prevTo);
  const change = ratingChangeBetween(snaps, range.from, range.to);
  const out: Insight[] = [];

  if (gained === null) return [{ text: 'There are no snapshots in or before this period yet.', tone: 'neutral' }];
  out.push(
    gained > 0
      ? { text: `You gained ${gained} review${gained === 1 ? '' : 's'} in ${phrase}.`, tone: 'good' }
      : { text: `No new reviews were recorded in ${phrase}.`, tone: 'neutral' }
  );

  if (change !== null) {
    const rounded = round(Math.abs(change), 1);
    if (rounded === 0) out.push({ text: `Your rating held steady at ${statsAsOf(snaps, [], range.to).average?.toFixed(1)}\u2605.`, tone: 'neutral' });
    else out.push({ text: `Your rating ${change > 0 ? 'increased' : 'decreased'} by ${rounded.toFixed(1)} star${rounded === 1 ? '' : 's'}.`, tone: change > 0 ? 'good' : 'bad' });
  }

  if (prevGained !== null && prevGained > 0 && gained > 0) {
    const pct = Math.round((gained / prevGained - 1) * 100);
    if (pct > 0) out.push({ text: `Review growth accelerated by ${pct}%.`, tone: 'good' });
    else if (pct < 0) out.push({ text: `Review growth slowed by ${Math.abs(pct)}%.`, tone: 'bad' });
    else out.push({ text: 'Review growth matched the previous period.', tone: 'neutral' });
    if (gained > prevGained) out.push({ text: 'Average review acquisition improved compared to the previous period.', tone: 'good' });
  } else if (prevGained === 0 && gained > 0) {
    out.push({ text: 'Reviews picked up again after a period with none.', tone: 'good' });
  } else if (prevGained !== null && prevGained > 0 && gained === 0) {
    out.push({ text: `Review growth stalled: the previous period added ${prevGained}.`, tone: 'bad' });
  }
  return out;
}
