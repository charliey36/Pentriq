import { UK_TIMEZONE } from '@/lib/uk-defaults';

/**
 * Pure analytics helpers for Google reviews: no I/O, so they are unit-tested
 * and shared by the sync job (daily snapshots) and the Reviews Analytics page.
 *
 * "Dates" are YYYY-MM-DD keys in Europe/London, consistent with the rest of
 * the product's UK-first behaviour, so a review left at 23:30 on the last day
 * of a month counts toward that month for the business owner.
 */

export type ReviewLite = { rating: number; review_date: string };
export type SnapshotLite = {
  date: string;
  total_reviews: number;
  average_rating: number;
  reviews_gained_today: number;
};

// ---------------------------------------------------------------------------
// Date keys
// ---------------------------------------------------------------------------

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: UK_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD for an instant, in Europe/London. */
export function dateKey(input: string | Date): string {
  return dayFormatter.format(typeof input === 'string' ? new Date(input) : input);
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMonths(key: string, months: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
export const monthKey = (key: string) => key.slice(0, 7);

/** Last day of the month before `key`. */
export const previousMonthEnd = (key: string) => addDays(monthStart(key), -1);

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Mean rating rounded to 2 dp (matches the numeric(3,2) snapshot column). */
export function averageOf(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  return round(ratings.reduce((a, b) => a + b, 0) / ratings.length, 2);
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/**
 * Derives one snapshot per day on which a review arrived, plus `to`
 * (so "today" always has a row). Used to backfill history on the first sync.
 */
export function buildSnapshotsFromReviews(reviews: ReviewLite[], to: string): SnapshotLite[] {
  if (reviews.length === 0) return [{ date: to, total_reviews: 0, average_rating: 0, reviews_gained_today: 0 }];

  const byDay = new Map<string, number[]>();
  for (const r of reviews) {
    const key = dateKey(r.review_date);
    if (key > to) continue;
    byDay.set(key, [...(byDay.get(key) ?? []), r.rating]);
  }

  const days = Array.from(byDay.keys()).sort();
  let total = 0;
  let sum = 0;
  const out: SnapshotLite[] = [];
  for (const day of days) {
    const ratings = byDay.get(day)!;
    total += ratings.length;
    sum += ratings.reduce((a, b) => a + b, 0);
    out.push({
      date: day,
      total_reviews: total,
      average_rating: round(sum / total, 2),
      reviews_gained_today: ratings.length,
    });
  }
  if (out[out.length - 1]?.date !== to) {
    out.push({
      date: to,
      total_reviews: total,
      average_rating: total ? round(sum / total, 2) : 0,
      reviews_gained_today: 0,
    });
  }
  return out;
}

export type DayStats = { total: number; average: number | null };

/**
 * Review total and average as of the end of `asOf`. Prefers stored daily
 * snapshots (carrying the latest one forward); falls back to deriving it from
 * the reviews themselves when no snapshot exists yet.
 */
export function statsAsOf(snapshots: SnapshotLite[], reviews: ReviewLite[], asOf: string): DayStats {
  let best: SnapshotLite | undefined;
  for (const s of snapshots) {
    if (s.date <= asOf && (!best || s.date > best.date)) best = s;
  }
  if (best) return { total: best.total_reviews, average: best.total_reviews > 0 ? Number(best.average_rating) : null };

  const upTo = reviews.filter((r) => dateKey(r.review_date) <= asOf);
  return { total: upTo.length, average: upTo.length ? averageOf(upTo.map((r) => r.rating)) : null };
}

export type DailyPoint = {
  date: string;
  total: number;
  average: number | null;
  gained: number;
};

/** One point per day in [from, to], carrying the last known stats across quiet days. */
export function dailySeries(snapshots: SnapshotLite[], reviews: ReviewLite[], from: string, to: string): DailyPoint[] {
  const byDate = new Map(snapshots.map((s) => [s.date, s]));
  let carry = statsAsOf(snapshots, reviews, addDays(from, -1));
  const out: DailyPoint[] = [];
  for (const day of eachDay(from, to)) {
    const snap = byDate.get(day);
    if (snap) {
      carry = { total: snap.total_reviews, average: snap.total_reviews > 0 ? Number(snap.average_rating) : null };
    }
    out.push({ date: day, total: carry.total, average: carry.average, gained: snap?.reviews_gained_today ?? 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

export type ReviewSummary = {
  averageRating: number | null;
  totalReviews: number;
  reviewsThisMonth: number;
  reviewsLastMonth: number;
  /** Current average minus the average at the end of last month (1 dp). Null when either is unknown. */
  ratingChange: number | null;
  previousMonthAverage: number | null;
};

export function summarize(reviews: ReviewLite[], snapshots: SnapshotLite[], today: string): ReviewSummary {
  const now = statsAsOf(snapshots, reviews, today);
  const thisMonth = monthKey(today);
  const lastMonth = monthKey(previousMonthEnd(today));

  let reviewsThisMonth = 0;
  let reviewsLastMonth = 0;
  for (const r of reviews) {
    const m = monthKey(dateKey(r.review_date));
    if (m === thisMonth) reviewsThisMonth += 1;
    else if (m === lastMonth) reviewsLastMonth += 1;
  }

  const prev = statsAsOf(snapshots, reviews, previousMonthEnd(today));
  const ratingChange = now.average !== null && prev.average !== null ? round(now.average - prev.average, 1) : null;

  return {
    averageRating: now.average,
    totalReviews: now.total,
    reviewsThisMonth,
    reviewsLastMonth,
    ratingChange: ratingChange === 0 ? 0 : ratingChange, // normalise -0
    previousMonthAverage: prev.average,
  };
}

export type DistributionRow = { stars: 1 | 2 | 3 | 4 | 5; count: number };

/** Counts per star rating, 5 down to 1. */
export function ratingDistribution(reviews: ReviewLite[]): DistributionRow[] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const r of reviews) if (r.rating >= 1 && r.rating <= 5) counts[r.rating] += 1;
  return ([5, 4, 3, 2, 1] as const).map((stars) => ({ stars, count: counts[stars] }));
}

// ---------------------------------------------------------------------------
// Monthly insights
// ---------------------------------------------------------------------------

export type MonthlyInsights = {
  reviewsGained: number;
  averageRating: number | null;
  bestRating: number | null;
  worstRating: number | null;
  percentFourPlus: number | null;
  sentences: string[];
};

export function monthlyInsights(reviews: ReviewLite[], today: string): MonthlyInsights {
  const month = monthKey(today);
  const mine = reviews.filter((r) => monthKey(dateKey(r.review_date)) === month);
  const gained = mine.length;

  if (gained === 0) {
    return {
      reviewsGained: 0,
      averageRating: null,
      bestRating: null,
      worstRating: null,
      percentFourPlus: null,
      sentences: ['No new reviews yet this month.'],
    };
  }

  const ratings = mine.map((r) => r.rating);
  const average = round(ratings.reduce((a, b) => a + b, 0) / gained, 1);
  const percent = Math.round((ratings.filter((r) => r >= 4).length / gained) * 100);

  return {
    reviewsGained: gained,
    averageRating: average,
    bestRating: Math.max(...ratings),
    worstRating: Math.min(...ratings),
    percentFourPlus: percent,
    sentences: [
      `You gained ${gained} review${gained === 1 ? '' : 's'} this month.`,
      `Average rating was ${average.toFixed(1)}\u2605.`,
      `${percent}% of reviews were 4\u2605 or higher.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Filters & chart series
// ---------------------------------------------------------------------------

export const RANGE_KEYS = ['7d', '30d', '90d', '12m', 'custom'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export type ResolvedRange = { key: RangeKey; from: string; to: string; label: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (s: string) => DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && addDays(s, 0) === s;
const MAX_CUSTOM_DAYS = 366 * 5;

/** Turns query-string filter values into a validated inclusive date range (default: last 30 days). */
export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  today: string
): ResolvedRange {
  switch (params.range) {
    case '7d':
      return { key: '7d', from: addDays(today, -6), to: today, label: 'Last 7 days' };
    case '90d':
      return { key: '90d', from: addDays(today, -89), to: today, label: 'Last 90 days' };
    case '12m':
      return { key: '12m', from: addDays(addMonths(today, -12), 1), to: today, label: 'Last 12 months' };
    case 'custom': {
      const { from, to } = params;
      if (from && to && isRealDate(from) && isRealDate(to) && from <= to) {
        const clampedTo = to > today ? today : to;
        if (from <= clampedTo && daysBetween(from, clampedTo) <= MAX_CUSTOM_DAYS) {
          return { key: 'custom', from, to: clampedTo, label: `${from} to ${clampedTo}` };
        }
      }
      break;
    }
  }
  return { key: '30d', from: addDays(today, -29), to: today, label: 'Last 30 days' };
}

export function filterByRange<T extends { review_date: string }>(reviews: T[], from: string, to: string): T[] {
  return reviews.filter((r) => {
    const d = dateKey(r.review_date);
    return d >= from && d <= to;
  });
}

export const GROWTH_PERIODS = ['month', '3m', '12m'] as const;
export type GrowthPeriod = (typeof GROWTH_PERIODS)[number];

export function growthRange(period: GrowthPeriod, today: string): { from: string; to: string } {
  switch (period) {
    case 'month':
      return { from: monthStart(today), to: today };
    case '3m':
      return { from: addDays(addMonths(today, -3), 1), to: today };
    case '12m':
      return { from: addDays(addMonths(today, -12), 1), to: today };
  }
}

/** Largest allowed number of chart points: longer ranges are bucketed weekly. */
const MAX_POINTS = 120;

/**
 * Compacts a long daily series into weekly buckets (last value of each week,
 * summed gains) so charts stay readable and light on mobile.
 */
export function bucketSeries(points: DailyPoint[]): DailyPoint[] {
  if (points.length <= MAX_POINTS) return points;
  const out: DailyPoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const week = points.slice(i, i + 7);
    const last = week[week.length - 1];
    out.push({ ...last, gained: week.reduce((a, p) => a + p.gained, 0) });
  }
  return out;
}

export function formatRatingChange(change: number | null): string {
  if (change === null) return '\u2014';
  const sign = change > 0 ? '+' : change < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(change).toFixed(1)}\u2605`;
}
