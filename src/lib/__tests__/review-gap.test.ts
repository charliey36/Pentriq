import { describe, expect, it } from '@jest/globals';
import { ASSUMED_CURRENT_CAPTURE, ASSUMED_PENTRIQ_CAPTURE, calculateReviewGap, validateGapInput } from '@/lib/review-gap';

describe('review gap calculator', () => {
  it('estimates missed reviews from the stated assumptions', () => {
    const r = calculateReviewGap({ monthlyCustomers: 100, currentReviews: 50, averageRating: 4.6 })!;
    const expected = Math.round(100 * (ASSUMED_PENTRIQ_CAPTURE - ASSUMED_CURRENT_CAPTURE));
    expect(r.missedPerMonth).toBe(expected);
    expect(r.missedPerYear).toBe(expected * 12);
    expect(r.reviewsInYearWithPentriq).toBeGreaterThan(r.reviewsInYearNow);
    expect(r.growthPercent).toBe(Math.round(((r.reviewsInYearWithPentriq - 50) / 50) * 100));
  });
  it('handles zero reviews (no percentage) and suggests the single plan', () => {
    const r = calculateReviewGap({ monthlyCustomers: 40, currentReviews: 0, averageRating: 4 })!;
    expect(r.growthPercent).toBeNull();
    expect(r.plan.name).toBe('Pentriq');
    expect(r.plan.price).toBeGreaterThan(0);
    expect(r.costPerExtraReview).not.toBeNull();
  });
  it('is gentle for tiny businesses', () => {
    const r = calculateReviewGap({ monthlyCustomers: 5, currentReviews: 3, averageRating: 5 })!;
    expect(r.missedPerMonth).toBeGreaterThanOrEqual(0);
    expect(r.message.length).toBeGreaterThan(10);
  });
  it('rejects invalid input', () => {
    expect(calculateReviewGap({ monthlyCustomers: 0, currentReviews: 0, averageRating: 4 })).toBeNull();
    expect(validateGapInput({ monthlyCustomers: 10, currentReviews: -1, averageRating: 4 })).toMatch(/reviews/);
    expect(validateGapInput({ monthlyCustomers: 10, currentReviews: 1, averageRating: 6 })).toMatch(/rating/);
    expect(validateGapInput({ monthlyCustomers: NaN, currentReviews: 1, averageRating: 4 })).toMatch(/customers/);
  });
});
