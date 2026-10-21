/**
 * Server-side validation for the Settings form. Pure (no I/O) so it can be
 * unit-tested and shared between the server action and any future API route.
 *
 * Field names mirror columns on public.businesses exactly:
 *   name, google_review_url, review_request_window_days,
 *   rebooking_reminder_interval_days, rebooking_reminders_enabled
 */
import { normalizeContactEmail } from '@/lib/email-templates/support-footer';
import { isSafeHttpUrl } from '@/lib/email-templates/review-destinations';

export const SETTINGS_LIMITS = {
  nameMaxLength: 120,
  urlMaxLength: 2048,
  reviewWindowDays: { min: 1, max: 365 },
  rebookingIntervalDays: { min: 1, max: 730 },
  reviewCooldownDays: { min: 1, max: 365 },
} as const;

export type SettingsValues = {
  name: string;
  google_review_url: string;
  review_request_window_days: number;
  rebooking_reminder_interval_days: number;
  rebooking_reminders_enabled: boolean;
  review_cooldown_enabled: boolean;
  review_cooldown_days: number;
  booking_url: string | null;
  contact_email: string | null;
};

export type SettingsParseResult =
  | { ok: true; values: SettingsValues }
  | { ok: false; error: string; field: keyof SettingsValues; fieldErrors?: UrlFieldErrors };

export type UrlFieldErrors = { google_review_url?: string; booking_url?: string; contact_email?: string };

/**
 * Both customer-facing links are mandatory: review requests need the review URL and
 * rebooking reminders need the booking URL. Returns a message per invalid field.
 * Shared by the server action and the Settings form (which shows the same messages).
 */
export function validateRequiredUrls(urls: { google_review_url: string; booking_url: string }): UrlFieldErrors {
  const errors: UrlFieldErrors = {};
  const review = urls.google_review_url.trim();
  const booking = urls.booking_url.trim();
  if (!review) errors.google_review_url = 'Google Review URL is required.';
  else if (review.length > SETTINGS_LIMITS.urlMaxLength || !isSafeHttpUrl(review)) {
    errors.google_review_url = 'Please enter a valid Review URL (starting with http:// or https://).';
  }
  if (!booking) errors.booking_url = 'Booking URL is required.';
  else if (booking.length > SETTINGS_LIMITS.urlMaxLength || !isSafeHttpUrl(booking)) {
    errors.booking_url = 'Please enter a valid Booking URL (starting with http:// or https://).';
  }
  return errors;
}

function parseDays(raw: FormDataEntryValue | null, min: number, max: number): number | null {
  if (raw === null || String(raw).trim() === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function parseSettingsForm(formData: FormData): SettingsParseResult {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, field: 'name', error: 'Business name is required.' };
  if (name.length > SETTINGS_LIMITS.nameMaxLength) {
    return {
      ok: false,
      field: 'name',
      error: `Business name must be ${SETTINGS_LIMITS.nameMaxLength} characters or fewer.`,
    };
  }

  const googleReviewUrl = String(formData.get('google_review_url') ?? '').trim();
  const bookingUrl = String(formData.get('booking_url') ?? '').trim();
  const fieldErrors = validateRequiredUrls({ google_review_url: googleReviewUrl, booking_url: bookingUrl });
  if (fieldErrors.google_review_url) return { ok: false, field: 'google_review_url', error: fieldErrors.google_review_url, fieldErrors };
  if (fieldErrors.booking_url) return { ok: false, field: 'booking_url', error: fieldErrors.booking_url, fieldErrors };

  // Optional: blank hides the "Need help?" section; anything else must be a valid email address.
  const contactRaw = String(formData.get('contact_email') ?? '').trim();
  const contactEmail = normalizeContactEmail(contactRaw);
  if (contactRaw && !contactEmail) {
    return { ok: false, field: 'contact_email', error: 'Please enter a valid contact email address, or leave it blank.', fieldErrors: { contact_email: 'Please enter a valid email address, or leave it blank.' } };
  }

  const { reviewWindowDays: w, rebookingIntervalDays: r } = SETTINGS_LIMITS;
  const windowDays = parseDays(formData.get('review_request_window_days'), w.min, w.max);
  if (windowDays === null) {
    return {
      ok: false,
      field: 'review_request_window_days',
      error: `Review request window must be a whole number of days between ${w.min} and ${w.max}.`,
    };
  }

  const rebookDays = parseDays(formData.get('rebooking_reminder_interval_days'), r.min, r.max);
  if (rebookDays === null) {
    return {
      ok: false,
      field: 'rebooking_reminder_interval_days',
      error: `Rebooking reminder interval must be a whole number of days between ${r.min} and ${r.max}.`,
    };
  }

  // Cooldown: the days field is only validated (and changed) while the toggle is on;
  // otherwise the stored value is kept so re-enabling restores it.
  const cooldownEnabled = formData.get('review_cooldown_enabled') === 'on';
  const c = SETTINGS_LIMITS.reviewCooldownDays;
  let cooldownDays = parseDays(formData.get('review_cooldown_days'), c.min, c.max);
  if (cooldownEnabled && cooldownDays === null) {
    return {
      ok: false,
      field: 'review_cooldown_days',
      error: `Cooldown period must be a whole number of days between ${c.min} and ${c.max}.`,
    };
  }
  cooldownDays ??= 60;

  return {
    ok: true,
    values: {
      name,
      google_review_url: googleReviewUrl,
      review_request_window_days: windowDays,
      rebooking_reminder_interval_days: rebookDays,
      rebooking_reminders_enabled: formData.get('rebooking_reminders_enabled') === 'on',
      review_cooldown_enabled: cooldownEnabled,
      review_cooldown_days: cooldownDays,
      booking_url: bookingUrl,
      contact_email: contactEmail,
    },
  };
}
