/**
 * Single source of truth for the product's name and brand strings.
 *
 * Import from here instead of typing the product name in code, so a future
 * rename is a one-file change. (Long-form prose in marketing/legal pages and
 * documentation is written out in plain text on purpose, so it stays easy for
 * non-developers to edit.)
 *
 * No server-only imports: safe to use from client components, server code,
 * emails and tests.
 */

export const APP_NAME = 'Pentriq';

/**
 * The two-tone wordmark used by the logo lockups and email header
 * ("Pentr" in the ink colour + "iq" in the brand accent). Placeholder styling
 * until final Pentriq brand assets are supplied — see BRANDING_REPORT.md.
 */
export const APP_NAME_LEAD = 'Pentr';
export const APP_NAME_ACCENT = 'iq';

export const APP_TAGLINE = 'AI-powered reputation management';
export const APP_TITLE = `${APP_NAME} — ${APP_TAGLINE}`;
export const APP_DESCRIPTION =
  'An AI-powered reputation management platform helping businesses collect, monitor, analyse and improve customer reviews. Automate review requests, track ratings and growth, and bring customers back, with a private feedback channel on every request.';

/** Prefix for browser storage keys and similar machine identifiers (lowercase, no spaces). */
export const APP_SLUG = 'pentriq';

/** Browser localStorage keys. */
export const STORAGE_KEYS = {
  theme: `${APP_SLUG}-theme`,
  sidebarOpen: `${APP_SLUG}-sidebar-open`,
  setupDismissed: `${APP_SLUG}-setup-dismissed`,
} as const;

/**
 * Public base URL of the deployed app. Every link we put in customer emails
 * (review tracking, private feedback, unsubscribe, rebooking, hosted logo)
 * is built from this, so it must be the real public address — never localhost.
 * Override with NEXT_PUBLIC_APP_URL (e.g. for a custom domain or a staging site).
 */
export const DEFAULT_APP_URL = 'https://pentriq-blond.vercel.app';

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).trim().replace(/\/+$/, '');
}

/** "{business} via Pentriq" — the display name on outgoing customer emails. */
export function senderDisplayName(businessName: string): string {
  return `${businessName} via ${APP_NAME}`;
}
