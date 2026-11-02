/**
 * Embeddable "reviews wall" for a business's own website. Pure helpers (no I/O) so the rules are testable:
 * only strong (>= 4 star) reviews that have written text are shown, newest first, text trimmed.
 * Reviews are already public on Google; the widget is still opt-in per business (businesses.widget_enabled).
 */
export type WidgetReview = { reviewer_name: string; rating: number; comment: string | null; review_date: string };

export const WIDGET_MIN_RATING = 4;
export const WIDGET_MAX_REVIEWS = 6;
export const WIDGET_MAX_COMMENT = 280;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

export function pickWidgetReviews(reviews: WidgetReview[], max = WIDGET_MAX_REVIEWS): WidgetReview[] {
  return reviews
    .filter((r) => r.rating >= WIDGET_MIN_RATING && (r.comment ?? '').trim().length > 0)
    .sort((a, b) => b.review_date.localeCompare(a.review_date))
    .slice(0, max)
    .map((r) => {
      const text = (r.comment ?? '').trim();
      return { ...r, reviewer_name: r.reviewer_name.trim() || 'Customer', comment: text.length > WIDGET_MAX_COMMENT ? `${text.slice(0, WIDGET_MAX_COMMENT - 1).trimEnd()}…` : text };
    });
}

/** Average over ALL supplied ratings (not just the displayed ones), to one decimal. Null when empty. */
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
}

export function embedSnippet(appUrl: string, businessId: string, height = 520): string {
  const base = appUrl.replace(/\/$/, '');
  return `<iframe src="${base}/widget/${businessId}" title="Customer reviews" width="100%" height="${height}" style="border:0;max-width:720px" loading="lazy"></iframe>`;
}
