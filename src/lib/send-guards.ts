/**
 * Send-time guards that are about the BUSINESS being ready, as opposed to
 * billing (see `sendBlockedReason` in billing.ts).
 *
 * A business can now sign up, claim its trial and import customers before it
 * has set up a Google review link. Emails asking for a review would then have
 * nothing to click, so they are held until the link exists. Other message
 * types (rebooking, win-back, birthday) do not need a review link and are
 * unaffected.
 */
const REVIEW_PURPOSES = new Set(['review_request', 'review_reminder']);

export const REVIEW_LINK_REQUIRED_MESSAGE =
  'Add your business name and Google review link in Settings first. Review requests are held until then so customers see your business name and have somewhere to leave a review.';

/** How long the scheduled senders wait before looking at a held review message again. */
export const REVIEW_LINK_RETRY_MS = 60 * 60 * 1000;

/** Returns a reason string when this message must not be sent yet, otherwise null. */
export function reviewLinkBlockedReason(
  business: { google_review_url?: string | null; name?: string | null },
  purpose: string
): string | null {
  if (!REVIEW_PURPOSES.has(purpose)) return null;
  const hasLink = Boolean(business.google_review_url?.trim());
  // "My Business" is the placeholder a new account starts with; emails must not go out under it.
  const hasName = Boolean(business.name?.trim()) && business.name !== 'My Business';
  return hasLink && hasName ? null : REVIEW_LINK_REQUIRED_MESSAGE;
}
