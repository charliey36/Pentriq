/**
 * Small, honest forecasting helpers. Business owners ask "where will I be in a month at this pace?"; these
 * answer it with methods simple enough to explain (a least-squares trend and Holt's linear smoothing) and
 * always report how much history the answer rests on, so the UI can say "too early to tell" instead of
 * extrapolating from three data points.
 */

export type Trend = { slope: number; intercept: number; r2: number };

/** Ordinary least squares over equally spaced points (x = 0..n-1). */
export function linearTrend(series: number[]): Trend {
  const n = series.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
  if (n === 1) return { slope: 0, intercept: series[0], r2: 0 };
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  series.forEach((y, x) => {
    sxy += (x - meanX) * (y - meanY);
    sxx += (x - meanX) ** 2;
    syy += (y - meanY) ** 2;
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2: Math.round(r2 * 1000) / 1000 };
}

/**
 * Holt's linear (double exponential) smoothing: tracks a level and a trend, so recent change counts more than
 * old history. Returns `horizon` future values, never negative (these are counts).
 */
export function holtForecast(series: number[], horizon: number, alpha = 0.5, beta = 0.3): number[] {
  if (horizon <= 0) return [];
  if (series.length === 0) return Array(horizon).fill(0);
  if (series.length === 1) return Array(horizon).fill(Math.max(0, series[0]));
  let level = series[0];
  let trend = series[1] - series[0];
  for (let t = 1; t < series.length; t++) {
    const prevLevel = level;
    level = alpha * series[t] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return Array.from({ length: horizon }, (_, h) => Math.max(0, level + (h + 1) * trend));
}

export type Comparison = {
  current: number;
  previous: number;
  delta: number;
  /** % change vs previous, null when previous is 0 (no meaningful baseline). */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
};

export function compare(current: number, previous: number): Comparison {
  const delta = current - previous;
  const pct = previous === 0 ? null : Math.round((delta / previous) * 1000) / 10;
  return { current, previous, delta, pct, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

export type MilestoneProjection = {
  target: number;
  /** Whole days until the target at the current daily rate; 0 if already reached; null if the rate is 0. */
  daysToTarget: number | null;
  eta: Date | null;
};

/** When will `current` reach `target` at `dailyRate` per day? */
export function projectMilestone(current: number, dailyRate: number, target: number, now: Date = new Date()): MilestoneProjection {
  if (current >= target) return { target, daysToTarget: 0, eta: now };
  if (dailyRate <= 0) return { target, daysToTarget: null, eta: null };
  const days = Math.ceil((target - current) / dailyRate);
  return { target, daysToTarget: days, eta: new Date(now.getTime() + days * 86_400_000) };
}

/** Next round milestone above `current`: 10, 25, 50, 100, 150, 200, 250, 500, 750, 1000, then each 500. */
export function nextMilestone(current: number): number {
  const ladder = [10, 25, 50, 100, 150, 200, 250, 500, 750, 1000];
  const hit = ladder.find((m) => m > current);
  if (hit) return hit;
  return Math.floor(current / 500) * 500 + 500;
}

export type CountForecast = {
  /** Sum of the next `horizon` days. */
  expected: number;
  /** Mean of the history (per day). */
  dailyRate: number;
  direction: 'rising' | 'falling' | 'steady';
  /** False when there is too little history to trust the projection. */
  reliable: boolean;
  historyDays: number;
};

/**
 * Forecast the total over the next `horizon` days from a daily count series.
 * Needs at least two weeks of history to be marked reliable.
 */
export function forecastCounts(daily: number[], horizon = 30): CountForecast {
  const historyDays = daily.length;
  const total = daily.reduce((s, v) => s + v, 0);
  const dailyRate = historyDays ? total / historyDays : 0;
  const projected = holtForecast(daily, horizon, 0.3, 0.1);
  const expected = Math.round(projected.reduce((s, v) => s + v, 0));
  const { slope } = linearTrend(daily);
  const relativeSlope = dailyRate > 0 ? (slope * historyDays) / (dailyRate * historyDays || 1) : 0;
  const direction = relativeSlope > 0.15 ? 'rising' : relativeSlope < -0.15 ? 'falling' : 'steady';
  return { expected, dailyRate: Math.round(dailyRate * 100) / 100, direction, reliable: historyDays >= 14 && total >= 5, historyDays };
}

/** Group a daily series into consecutive buckets of `size` (e.g. 7 for weekly), summing each. */
export function rollUp(daily: number[], size: number): number[] {
  if (size <= 1) return [...daily];
  const out: number[] = [];
  for (let i = 0; i < daily.length; i += size) out.push(daily.slice(i, i + size).reduce((s, v) => s + v, 0));
  return out;
}
