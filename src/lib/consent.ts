/**
 * The owner must confirm they may contact the customers they add. The same
 * wording and form field are used on every entry point (add customer, CSV
 * import, onboarding) so the check lives in one place.
 */
export const CONSENT_FIELD = 'consent';

export const CONSENT_LABEL =
  'I confirm I have permission to email these customers about their visit, and they can opt out at any time.';

export const CONSENT_REQUIRED_MESSAGE = 'Please confirm you have permission to contact these customers.';

/** True when the submitted form has the consent box ticked. */
export function hasConsent(fd: FormData): boolean {
  return fd.get(CONSENT_FIELD) === 'on';
}
