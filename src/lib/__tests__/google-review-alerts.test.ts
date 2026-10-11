import { buildAlerts, NEW_REVIEW_BATCH_LIMIT, shouldEmail, type AlertInput, type NewReviewInfo } from '../google-review-alerts';

const rev = (id: string, rating: number, comment: string | null = 'Great'): NewReviewInfo => ({
  google_review_id: id,
  reviewer_name: `Reviewer ${id}`,
  rating,
  comment,
});

const base: AlertInput = {
  newReviews: [],
  today: '2026-10-11',
  currentAverage: 4.6,
  previousAverage: 4.6,
  lastMonthAverage: 4.6,
  threshold: 4.0,
};

describe('buildAlerts', () => {
  it('raises nothing when nothing changed', () => {
    expect(buildAlerts(base)).toEqual([]);
  });

  it('raises a new_review alert per new review, with a stable dedupe key', () => {
    const drafts = buildAlerts({ ...base, newReviews: [rev('a', 5)] });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ type: 'new_review', dedupe_key: 'new_review:a', google_review_id: 'a' });
    expect(drafts[0].title).toContain('5\u2605');
  });

  it('raises both new_review and new_one_star for a 1-star review', () => {
    const types = buildAlerts({ ...base, newReviews: [rev('x', 1)] }).map((d) => d.type);
    expect(types).toEqual(['new_review', 'new_one_star']);
  });

  it('summarises large batches into one alert but still flags each 1-star', () => {
    const many = Array.from({ length: NEW_REVIEW_BATCH_LIMIT + 2 }, (_, i) => rev(`r${i}`, i === 0 ? 1 : 5));
    const drafts = buildAlerts({ ...base, newReviews: many });
    expect(drafts.filter((d) => d.type === 'new_review')).toHaveLength(1);
    expect(drafts.filter((d) => d.type === 'new_one_star')).toHaveLength(1);
  });

  it('alerts when the average crosses below the threshold, not while it stays below', () => {
    const crossing = buildAlerts({ ...base, currentAverage: 3.9, previousAverage: 4.1, lastMonthAverage: null });
    expect(crossing.map((d) => d.type)).toEqual(['low_rating']);
    expect(crossing[0].dedupe_key).toBe('low_rating:2026-10-11');

    const alreadyBelow = buildAlerts({ ...base, currentAverage: 3.8, previousAverage: 3.9, lastMonthAverage: null });
    expect(alreadyBelow).toEqual([]);
  });

  it('treats exactly the threshold as not below it', () => {
    expect(buildAlerts({ ...base, currentAverage: 4.0, previousAverage: 4.2, lastMonthAverage: null })).toEqual([]);
  });

  it('alerts on a month-over-month decrease, once per month', () => {
    const drafts = buildAlerts({ ...base, currentAverage: 4.4, lastMonthAverage: 4.7 });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ type: 'rating_decrease', dedupe_key: 'rating_decrease:2026-10' });
  });

  it('ignores increases and changes that round to zero', () => {
    expect(buildAlerts({ ...base, currentAverage: 4.8, lastMonthAverage: 4.6 })).toEqual([]);
    expect(buildAlerts({ ...base, currentAverage: 4.58, lastMonthAverage: 4.6 })).toEqual([]);
  });

  it('is silent during the initial import, even with qualifying data', () => {
    expect(
      buildAlerts({ ...base, suppress: true, newReviews: [rev('a', 1)], currentAverage: 3, lastMonthAverage: 4.8 })
    ).toEqual([]);
  });

  it('truncates long comments in the message', () => {
    const [draft] = buildAlerts({ ...base, newReviews: [rev('a', 4, 'x'.repeat(500))] });
    expect(draft.message.length).toBeLessThan(150);
  });
});

describe('shouldEmail', () => {
  it('emails serious alerts but not routine new reviews', () => {
    expect(shouldEmail('new_review')).toBe(false);
    expect(shouldEmail('new_one_star')).toBe(true);
    expect(shouldEmail('low_rating')).toBe(true);
    expect(shouldEmail('rating_decrease')).toBe(true);
  });
});
