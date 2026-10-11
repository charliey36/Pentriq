import type { ReviewAlert } from '@/lib/database.types';
import { monthKey } from '@/lib/google-review-analytics';

/**
 * Review alert rules (pure). The sync job feeds in what changed and persists
 * the drafts; `dedupe_key` (unique per business) makes re-running a sync
 * idempotent, so the same review/crossing never alerts twice.
 */

export type AlertType = ReviewAlert['type'];

export type AlertDraft = {
  type: AlertType;
  title: string;
  message: string;
  google_review_id: string | null;
  dedupe_key: string;
};

export type NewReviewInfo = {
  google_review_id: string;
  reviewer_name: string;
  rating: number;
  comment: string | null;
};

export type AlertInput = {
  /** Reviews inserted by this sync (empty on the initial historical import). */
  newReviews: NewReviewInfo[];
  /** YYYY-MM-DD (Europe/London). */
  today: string;
  currentAverage: number | null;
  /** Average before this sync (latest earlier snapshot); null if unknown. */
  previousAverage: number | null;
  /** Average at the end of last calendar month; null if unknown. */
  lastMonthAverage: number | null;
  threshold: number;
  /** Suppress everything (initial import of historical reviews). */
  suppress?: boolean;
};

/** More new reviews than this in one sync are summarised into a single alert. */
export const NEW_REVIEW_BATCH_LIMIT = 5;

const stars = (n: number) => `${n}\u2605`;
const excerpt = (s: string | null, max = 120) => {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}\u2026` : t;
};
const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

export function buildAlerts(input: AlertInput): AlertDraft[] {
  if (input.suppress) return [];
  const drafts: AlertDraft[] = [];
  const { newReviews, today, currentAverage, previousAverage, lastMonthAverage, threshold } = input;

  // 1. New review(s)
  if (newReviews.length > NEW_REVIEW_BATCH_LIMIT) {
    const ids = newReviews.map((r) => r.google_review_id).sort();
    drafts.push({
      type: 'new_review',
      title: `${newReviews.length} new Google reviews`,
      message: `${newReviews.length} new reviews arrived since the last sync.`,
      google_review_id: null,
      dedupe_key: `new_review_batch:${ids[0]}:${ids.length}`,
    });
  } else {
    for (const r of newReviews) {
      const text = excerpt(r.comment);
      drafts.push({
        type: 'new_review',
        title: `New ${stars(r.rating)} review from ${r.reviewer_name}`,
        message: text ? `\u201C${text}\u201D` : 'No written comment.',
        google_review_id: r.google_review_id,
        dedupe_key: `new_review:${r.google_review_id}`,
      });
    }
  }

  // 2. New 1-star review (always individual: these need a fast response)
  for (const r of newReviews) {
    if (r.rating !== 1) continue;
    const text = excerpt(r.comment);
    drafts.push({
      type: 'new_one_star',
      title: `New 1\u2605 review from ${r.reviewer_name}`,
      message: text ? `\u201C${text}\u201D Consider replying promptly.` : 'No written comment. Consider replying promptly.',
      google_review_id: r.google_review_id,
      dedupe_key: `new_one_star:${r.google_review_id}`,
    });
  }

  // 3. Average rating fell below the threshold (on the crossing, not every sync)
  if (
    currentAverage !== null &&
    previousAverage !== null &&
    previousAverage >= threshold &&
    currentAverage < threshold
  ) {
    drafts.push({
      type: 'low_rating',
      title: 'Average rating fell below your threshold',
      message: `Your average rating is now ${currentAverage.toFixed(2)}\u2605, below your alert threshold of ${threshold.toFixed(1)}\u2605.`,
      google_review_id: null,
      dedupe_key: `low_rating:${today}`,
    });
  }

  // 4. Month-over-month decrease (at most once per month)
  if (currentAverage !== null && lastMonthAverage !== null) {
    const change = round1(currentAverage - lastMonthAverage);
    if (change < 0) {
      drafts.push({
        type: 'rating_decrease',
        title: 'Average rating is down on last month',
        message: `Your average rating is ${currentAverage.toFixed(2)}\u2605, down ${Math.abs(change).toFixed(1)}\u2605 from ${lastMonthAverage.toFixed(2)}\u2605 at the end of last month.`,
        google_review_id: null,
        dedupe_key: `rating_decrease:${monthKey(today)}`,
      });
    }
  }

  return drafts;
}

/** Alert types worth an email (new_review is in-app only to avoid inbox noise). */
export function shouldEmail(type: AlertType): boolean {
  return type !== 'new_review';
}
