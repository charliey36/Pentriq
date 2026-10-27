/**
 * Review gap calculator maths for the public website. Pure and deterministic.
 *
 * The capture rates are ILLUSTRATIVE assumptions, not guarantees, and the page
 * says so: businesses that ask ad hoc typically collect reviews from a small
 * share of customers, while an automatic request plus two reminders reaches
 * more of them. They are exported so the page can show the assumptions used.
 */
import { PLAN } from '@/lib/billing';

export const ASSUMED_CURRENT_CAPTURE = 0.03; // reviews per customer when asking ad hoc
export const ASSUMED_PENTRIQ_CAPTURE = 0.08; // conservative rate with automatic request + 2 reminders

export const LIMITS = {
  monthlyCustomers: { min: 1, max: 100_000 },
  currentReviews: { min: 0, max: 1_000_000 },
  averageRating: { min: 1, max: 5 },
} as const;

export type GapInput = { monthlyCustomers: number; currentReviews: number; averageRating: number };

export type GapResult = {
  missedPerMonth: number;
  missedPerYear: number;
  reviewsInYearNow: number;
  reviewsInYearWithPentriq: number;
  /** Percentage growth of the review count over 12 months with Pentriq (null when starting from zero). */
  growthPercent: number | null;
  /** Rough cost of each extra review, in pounds. */
  costPerExtraReview: number | null;
  plan: { name: string; price: number; currency: string; reason: string };
  message: string;
};

export function validateGapInput(i: Partial<GapInput>): string | null {
  const { monthlyCustomers: c, currentReviews: r, averageRating: a } = i;
  if (!Number.isFinite(c) || (c as number) < LIMITS.monthlyCustomers.min || (c as number) > LIMITS.monthlyCustomers.max) return 'Enter how many customers you serve each month (at least 1).';
  if (!Number.isFinite(r) || (r as number) < LIMITS.currentReviews.min || (r as number) > LIMITS.currentReviews.max) return 'Enter your current number of reviews (0 or more).';
  if (!Number.isFinite(a) || (a as number) < LIMITS.averageRating.min || (a as number) > LIMITS.averageRating.max) return 'Enter your average rating between 1 and 5.';
  return null;
}

export function calculateReviewGap(input: GapInput): GapResult | null {
  if (validateGapInput(input)) return null;
  const { monthlyCustomers, currentReviews, averageRating } = input;

  const nowPerMonth = monthlyCustomers * ASSUMED_CURRENT_CAPTURE;
  const withPerMonth = monthlyCustomers * ASSUMED_PENTRIQ_CAPTURE;
  const missedPerMonth = Math.max(0, Math.round(withPerMonth - nowPerMonth));
  const missedPerYear = missedPerMonth * 12;
  const reviewsInYearNow = Math.round(currentReviews + nowPerMonth * 12);
  const reviewsInYearWithPentriq = Math.round(currentReviews + withPerMonth * 12);
  const growthPercent = currentReviews > 0 ? Math.round(((reviewsInYearWithPentriq - currentReviews) / currentReviews) * 100) : null;
  const costPerExtraReview = missedPerMonth > 0 ? Math.round((PLAN.priceMonthly / missedPerMonth) * 100) / 100 : null;

  const plan = {
    name: PLAN.name,
    price: PLAN.priceMonthly,
    currency: PLAN.currency,
    reason:
      monthlyCustomers < 20
        ? 'A small customer base is where every review counts most, and one plan covers everything.'
        : 'Unlimited customers and review requests, with automatic reminders, in one simple plan.',
  };

  const message =
    missedPerMonth === 0
      ? 'You serve very few customers each month, so the gain is small, but a steady trickle of fresh reviews still builds trust.'
      : averageRating >= 4.5
        ? `Your ${averageRating.toFixed(1)} rating is excellent. You are missing about ${missedPerMonth} review${missedPerMonth === 1 ? '' : 's'} a month that could show it off.`
        : averageRating >= 4
          ? `Your ${averageRating.toFixed(1)} rating is solid. More reviews from happy customers would lift it and your visibility.`
          : `At ${averageRating.toFixed(1)}, a steady flow of recent reviews matters even more: they dilute older complaints and show how you work today.`;

  return { missedPerMonth, missedPerYear, reviewsInYearNow, reviewsInYearWithPentriq, growthPercent, costPerExtraReview, plan, message };
}
