import { resolveRange } from '../google-review-analytics';
import {
  computeReputation,
  generateInsights,
  monthlyMetrics,
  monthlySeries,
  ratingChangeBetween,
  reviewsGainedBetween,
  toSnapshots,
  validateSnapshot,
  velocityPercent,
} from '../reputation-metrics';

const snap = (snapshot_date: string, review_count: number, average_rating: number) => ({ snapshot_date, review_count, average_rating });
const TODAY = '2026-10-11';

describe('toSnapshots', () => {
  it('computes gains between entries (never negative) and sorts by date', () => {
    const s = toSnapshots([snap('2026-10-01', 62, 4.8), snap('2026-09-01', 47, 4.6), snap('2026-10-05', 60, 4.7)]);
    expect(s.map((x) => [x.date, x.reviews_gained_today])).toEqual([['2026-09-01', 0], ['2026-10-01', 15], ['2026-10-05', 0]]);
  });
});

describe('gains and rating change (spec examples)', () => {
  const snaps = toSnapshots([snap('2026-09-30', 47, 4.6), snap('2026-10-10', 62, 4.8)]);

  it('47 -> 62 is +15 reviews and 4.6 -> 4.8 is +0.2', () => {
    expect(reviewsGainedBetween(snaps, '2026-10-01', '2026-10-11')).toBe(15);
    expect(ratingChangeBetween(snaps, '2026-10-01', '2026-10-11')).toBe(0.2);
  });

  it('uses the first snapshot as the baseline and returns null before any data', () => {
    expect(reviewsGainedBetween(snaps, '2026-08-01', '2026-10-11')).toBe(15);
    expect(reviewsGainedBetween(snaps, '2026-01-01', '2026-02-01')).toBeNull();
    expect(reviewsGainedBetween([], '2026-10-01', TODAY)).toBeNull();
    expect(ratingChangeBetween(snaps, '2026-08-01', '2026-09-01')).toBeNull(); // nothing earlier to compare
  });
});

describe('velocity', () => {
  it('12 -> 24 reviews over equal periods is +100%', () => {
    expect(velocityPercent(12, 30, 24, 30)).toBe(100);
  });
  it('normalises for a part-way-through month', () => {
    expect(velocityPercent(30, 30, 15, 15)).toBe(0); // same daily pace
  });
  it('handles zero history', () => {
    expect(velocityPercent(0, 30, 5, 10)).toBeNull();
    expect(velocityPercent(0, 30, 0, 10)).toBe(0);
    expect(velocityPercent(5, 0, 5, 10)).toBeNull();
  });
});

describe('computeReputation', () => {
  it('reports the dashboard cards', () => {
    const snaps = toSnapshots([snap('2026-08-31', 20, 4.5), snap('2026-09-30', 32, 4.6), snap('2026-10-11', 41, 4.8)]);
    const r = computeReputation(snaps, TODAY);
    expect(r).toMatchObject({ hasData: true, averageRating: 4.8, totalReviews: 41, gainedThisMonth: 9, gainedLastMonth: 12, ratingChange: 0.2 });
    // 9 in 11 days (0.82/day) vs 12 in 30 days (0.4/day) => +105%
    expect(r.velocity).toBe(105);
  });

  it('is empty-safe', () => {
    expect(computeReputation([], TODAY)).toMatchObject({ hasData: false, averageRating: null, totalReviews: 0, gainedThisMonth: 0, ratingChange: null, velocity: null });
  });

  it('has no velocity or change until a previous month exists', () => {
    const r = computeReputation(toSnapshots([snap('2026-10-03', 10, 4.0), snap('2026-10-10', 14, 4.2)]), TODAY);
    expect(r.gainedThisMonth).toBe(4);
    expect(r.velocity).toBeNull();
    expect(r.ratingChange).toBeNull();
  });
});

describe('monthlySeries / monthlyMetrics', () => {
  const snaps = toSnapshots([snap('2026-08-15', 10, 4.0), snap('2026-08-31', 12, 4.1), snap('2026-09-30', 24, 4.4), snap('2026-10-11', 30, 4.5)]);

  it('lists months from the first snapshot with gains and velocity', () => {
    const m = monthlySeries(snaps, TODAY, 12);
    expect(m.map((x) => [x.month, x.gained])).toEqual([['2026-08', 2], ['2026-09', 12], ['2026-10', 6]]);
    expect(m[0].velocity).toBeNull();
    expect(m[1].velocity).not.toBeNull();
  });

  it('produces roll-up rows for review_metrics', () => {
    const rows = monthlyMetrics(snaps, TODAY);
    expect(rows[1]).toMatchObject({ period: '2026-09', reviews_gained: 12, review_count: 24, average_rating: 4.4, rating_change: 0.3 });
    expect(rows[0].rating_change).toBe(0);
  });
});

describe('generateInsights', () => {
  const snaps = toSnapshots([snap('2026-08-20', 40, 4.3), snap('2026-09-10', 44, 4.4), snap('2026-10-10', 62, 4.7)]);

  it('writes plain-English insights for a period', () => {
    const texts = generateInsights(snaps, resolveRange({ range: '30d' }, TODAY)).map((i) => i.text);
    expect(texts).toContain('You gained 18 reviews in the last 30 days.');
    expect(texts).toContain('Your rating increased by 0.3 stars.');
    expect(texts).toContain('Review growth accelerated by 350%.');
    expect(texts).toContain('Average review acquisition improved compared to the previous period.');
  });

  it('flags slowdowns and handles empty data', () => {
    const slow = toSnapshots([snap('2026-08-20', 10, 4.5), snap('2026-09-10', 30, 4.5), snap('2026-10-10', 32, 4.2)]);
    const out = generateInsights(slow, resolveRange({ range: '30d' }, TODAY));
    expect(out.find((i) => i.text.startsWith('Review growth slowed'))?.tone).toBe('bad');
    expect(out.find((i) => i.text.includes('decreased'))?.tone).toBe('bad');
    expect(generateInsights([], resolveRange({}, TODAY))[0].text).toMatch(/first snapshot/);
  });
});

describe('validateSnapshot', () => {
  it.each([
    [{ date: TODAY, count: 47, rating: 4.6 }, null],
    [{ date: TODAY, count: 0, rating: 0 }, null],
    [{ date: '2026-10-12', count: 5, rating: 4 }, 'future'],
    [{ date: '2026-02-30', count: 5, rating: 4 }, 'valid date'],
    [{ date: TODAY, count: -1, rating: 4 }, 'whole number'],
    [{ date: TODAY, count: 1.5, rating: 4 }, 'whole number'],
    [{ date: TODAY, count: 5, rating: 5.5 }, 'between 0 and 5'],
    [{ date: TODAY, count: 5, rating: 0 }, 'between 1 and 5'],
  ])('%j', (input, expected) => {
    const result = validateSnapshot(input, TODAY);
    if (expected === null) expect(result).toBeNull();
    else expect(result).toContain(expected);
  });
});
