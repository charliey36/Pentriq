import { isSafeHttpUrl } from '@/lib/email-templates/review-destinations';

export const BOOKING_URL_MAX_LENGTH = 2048;

/** Returns an error message, or null when empty (optional) or valid. */
export function validateBookingUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (url.length > BOOKING_URL_MAX_LENGTH || !isSafeHttpUrl(url)) {
    return 'Booking URL must be a valid web address starting with http:// or https:// (e.g. https://business.com/book).';
  }
  return null;
}

/**
 * Where a rebooking email's button points: the business's own booking page when set,
 * otherwise Pentriq's request page as a graceful fallback.
 */
export function rebookingLink(
  business: { booking_url?: string | null },
  customerId: string,
  appUrl: string
): string {
  const url = business.booking_url?.trim();
  return url && !validateBookingUrl(url) ? url : `${appUrl}/book/${customerId}`;
}
