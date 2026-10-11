import {
  addDays,
  addMonths,
  bucketSeries,
  buildSnapshotsFromReviews,
  dailySeries,
  dateKey,
  filterByRange,
  formatRatingChange,
  growthRange,
  monthlyInsights,
  previousMonthEnd,
  ratingDistribution,
  resolveRange,
  statsAsOf,
  summarize,
  type ReviewLite,
  type SnapshotLite,
} from '../google-review-analytics';

const review = (date: string, rating: number): ReviewLite => ({ rating, review_date: `${date}T12:00:00Z` });

describe('date keys', () => {
  it('uses Europe/London, not UTC, for day boundaries', () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST).
    expect(dateKey('2026-06-30T23:30:00Z')).toBe('2026-07-01');
    // In winter London == UTC.
    expect(dateKey('2026-01-31T23:30:00Z')).toBe('2026-01-31');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('clamps month arithmetic to the target month length', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-10-11', -12)).toBe('2025-10-11');
  });

  it('finds the end of the previous month', () => {
    expect(previousMonthEnd('2026-10-11')).toBe('2026-09-30');
    expect(previousMonthEnd('2026-01-05')).toBe('2025-12-31');
  });
});

describe('buildSnapshotsFromReviews', () => {
  it('builds cumulative daily snapshots and always includes today', () => {
    const snaps = buildSnapshotsFromReviews(
      [review('2026-10-01', 5), review('2026-10-01', 3), review('2026-10-05', 4)],
      '2026-10-11'
    );
    expect(snaps).toEqual([
      { date: '2026-10-01', total_reviews: 2, average_rating: 4, reviews_gained_today: 2 },
      { date: '2026-10-05', total_reviews: 3, average_rating: 4, reviews_gained_today: 1 },
      { date: '2026-10-11', total_reviews: 3, average_rating: 4, reviews_gained_today: 0 },
    ]);
  });

  it('returns an empty-state snapshot when there are no reviews', () => {
    expect(buildSnapshotsFromReviews([], '2026-10-11')).toEqual([
      { date: '2026-10-11', total_reviews: 0, average_rating: 0, reviews_gained_today: 0 },
    ]);
  });
});

describe('statsAsOf / dailySeries', () => {
  const snaps: SnapshotLite[] = [
    { date: '2026-09-10', total_reviews: 10, average_rating: 4.5, reviews_gained_today: 10 },
    { date: '2026-10-02', total_reviews: 12, average_rating: 4.6, reviews_gained_today: 2 },
  ];

  it('carries the latest snapshot forward', () => {
    expect(statsAsOf(snaps, [], '2026-09-30')).toEqual({ total: 10, average: 4.5 });
    expect(statsAsOf(snaps, [], '2026-10-11')).toEqual({ total: 12, average: 4.6 });
  });

  it('falls back to deriving from reviews when there is no earlier snapshot', () => {
    const reviews = [review('2026-08-01', 5), review('2026-08-02', 3)];
    expect(statsAsOf([], reviews, '2026-08-31')).toEqual({ total: 2, average: 4 });
    expect(statsAsOf([], reviews, '2026-07-31')).toEqual({ total: 0, average: null });
  });

  it('fills quiet days and reports gains only on snapshot days', () => {
    const series = dailySeries(snaps, [], '2026-10-01', '2026-10-04');
    expect(series.map((p) => [p.date, p.total, p.gained])).toEqual([
      ['2026-10-01', 10, 0],
      ['2026-10-02', 12, 2],
      ['2026-10-03', 12, 0],
      ['2026-10-04', 12, 0],
    ]);
    expect(series[0].average).toBe(4.5);
  });
});

describe('summarize (summary cards)', () => {
  const reviews = [
    review('2026-08-15', 5),
    review('2026-09-10', 4),
    review('2026-09-20', 4),
    review('2026-10-02', 5),
    review('2026-10-05', 5),
    review('2026-10-09', 3),
  ];
  const snapshots = buildSnapshotsFromReviews(reviews, '2026-10-11');

  it('computes average, total, this-month count and change vs last month', () => {
    const s = summarize(reviews, snapshots, '2026-10-11');
    expect(s.totalReviews).toBe(6);
    expect(s.averageRating).toBe(4.33);
    expect(s.reviewsThisMonth).toBe(3);
    expect(s.reviewsLastMonth).toBe(2);
    // End of September: (5+4+4)/3 = 4.33 -> unchanged at 1dp
    expect(s.previousMonthAverage).toBe(4.33);
    expect(s.ratingChange).toBe(0);
  });

  it('reports a positive and negative rating change', () => {
    const up = summarize(
      [review('2026-09-01', 4), review('2026-10-01', 5), review('2026-10-02', 5), review('2026-10-03', 5)],
      [],
      '2026-10-11'
    );
    expect(up.ratingChange).toBe(0.8); // 4.75 - 4.0
    const down = summarize([review('2026-09-01', 5), review('2026-10-01', 1)], [], '2026-10-11');
    expect(down.ratingChange).toBe(-2);
  });

  it('has no rating change when there were no reviews before this month', () => {
    const s = summarize([review('2026-10-01', 5)], [], '2026-10-11');
    expect(s.ratingChange).toBeNull();
    expect(s.averageRating).toBe(5);
  });

  it('handles zero reviews', () => {
    const s = summarize([], [], '2026-10-11');
    expect(s).toMatchObject({ averageRating: null, totalReviews: 0, reviewsThisMonth: 0, ratingChange: null });
  });

  it('counts a late-night review in the right London month', () => {
    // 23:30 UTC on 30 Sep = 00:30 on 1 Oct in London.
    const s = summarize([{ rating: 5, review_date: '2026-09-30T23:30:00Z' }], [], '2026-10-11');
    expect(s.reviewsThisMonth).toBe(1);
  });
});

describe('formatRatingChange', () => {
  it('formats sign and star', () => {
    expect(formatRatingChange(0.2)).toBe('+0.2\u2605');
    expect(formatRatingChange(-0.3)).toBe('\u22120.3\u2605');
    expect(formatRatingChange(0)).toBe('0.0\u2605');
    expect(formatRatingChange(null)).toBe('\u2014');
  });
});

describe('ratingDistribution', () => {
  it('returns counts from 5 stars down to 1', () => {
    const reviews = [5, 5, 5, 4, 4, 3, 1].map((r) => review('2026-10-01', r));
    expect(ratingDistribution(reviews)).toEqual([
      { stars: 5, count: 3 },
      { stars: 4, count: 2 },
      { stars: 3, count: 1 },
      { stars: 2, count: 0 },
      { stars: 1, count: 1 },
    ]);
  });
});

describe('monthlyInsights', () => {
  it('generates the monthly metrics and sentences', () => {
    const ratings = [5, 5, 5, 4, 4, 4, 5, 5, 5, 5, 5, 4, 4, 5, 5, 3, 5, 2];
    const reviews = ratings.map((r) => review('2026-10-03', r)).concat([review('2026-09-30', 1)]);
    const i = monthlyInsights(reviews, '2026-10-11');
    expect(i.reviewsGained).toBe(18);
    expect(i.bestRating).toBe(5);
    expect(i.worstRating).toBe(2);
    expect(i.averageRating).toBe(4.4);
    expect(i.percentFourPlus).toBe(89);
    expect(i.sentences).toEqual([
      'You gained 18 reviews this month.',
      'Average rating was 4.4\u2605.',
      '89% of reviews were 4\u2605 or higher.',
    ]);
  });

  it('uses singular wording and handles an empty month', () => {
    expect(monthlyInsights([review('2026-10-02', 5)], '2026-10-11').sentences[0]).toBe('You gained 1 review this month.');
    const empty = monthlyInsights([review('2026-09-02', 5)], '2026-10-11');
    expect(empty.reviewsGained).toBe(0);
    expect(empty.averageRating).toBeNull();
    expect(empty.sentences).toEqual(['No new reviews yet this month.']);
  });
});

describe('resolveRange', () => {
  const today = '2026-10-11';

  it.each([
    ['7d', '2026-10-05'],
    ['30d', '2026-09-12'],
    ['90d', '2026-07-14'],
    ['12m', '2025-10-12'],
  ])('resolves the %s preset', (key, from) => {
    expect(resolveRange({ range: key }, today)).toMatchObject({ key, from, to: today });
  });

  it('defaults to 30 days for missing or unknown input', () => {
    expect(resolveRange({}, today).key).toBe('30d');
    expect(resolveRange({ range: 'nonsense' }, today).key).toBe('30d');
  });

  it('accepts a valid custom range and clamps the end to today', () => {
    expect(resolveRange({ range: 'custom', from: '2026-09-01', to: '2026-09-15' }, today)).toMatchObject({
      key: 'custom',
      from: '2026-09-01',
      to: '2026-09-15',
    });
    expect(resolveRange({ range: 'custom', from: '2026-09-01', to: '2030-01-01' }, today).to).toBe(today);
  });

  it('rejects invalid custom ranges and falls back to 30 days', () => {
    for (const params of [
      { range: 'custom', from: '2026-09-15', to: '2026-09-01' }, // reversed
      { range: 'custom', from: 'abc', to: '2026-09-01' },
      { range: 'custom', from: '2026-02-30', to: '2026-03-05' }, // not a real date
      { range: 'custom', from: '2027-01-01', to: '2027-02-01' }, // entirely in the future
      { range: 'custom', from: '2000-01-01', to: '2026-09-01' }, // too long
      { range: 'custom' },
    ]) {
      expect(resolveRange(params, today).key).toBe('30d');
    }
  });
});

describe('filterByRange / growthRange / bucketSeries', () => {
  it('filters inclusively by London date', () => {
    const reviews = [review('2026-10-01', 5), review('2026-10-05', 4), review('2026-10-10', 3)];
    expect(filterByRange(reviews, '2026-10-05', '2026-10-10')).toHaveLength(2);
  });

  it('derives the growth periods', () => {
    expect(growthRange('month', '2026-10-11')).toEqual({ from: '2026-10-01', to: '2026-10-11' });
    expect(growthRange('3m', '2026-10-11')).toEqual({ from: '2026-07-12', to: '2026-10-11' });
    expect(growthRange('12m', '2026-10-11')).toEqual({ from: '2025-10-12', to: '2026-10-11' });
  });

  it('buckets long series weekly, keeping the last value and summing gains', () => {
    const points = Array.from({ length: 365 }, (_, i) => ({
      date: addDays('2025-10-12', i),
      total: i + 1,
      average: 4.5,
      gained: 1,
    }));
    const bucketed = bucketSeries(points);
    expect(bucketed.length).toBeLessThan(60);
    expect(bucketed[0]).toMatchObject({ total: 7, gained: 7 });
    expect(bucketed[bucketed.length - 1].total).toBe(365);
    expect(bucketed.reduce((n, p) => n + p.gained, 0)).toBe(365);
    // Short series are untouched.
    expect(bucketSeries(points.slice(0, 30))).toHaveLength(30);
  });
});
