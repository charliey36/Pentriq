/**
 * Detects reserved/testing email domains (RFC 2606 / 6761) that Resend rejects
 * with "Invalid 'to' field. Please use our testing email address instead of
 * domains like example.com." These failures are expected in testing, so they
 * are blocked before sending and filtered out of Sentry.
 */
const BLOCKED_DOMAINS = ['example.com', 'example.org', 'example.net', 'example.edu', 'test.com', 'localhost', 'invalid', 'test', 'example'];

export function isBlockedTestEmail(email: string | null | undefined): boolean {
  const value = (email ?? '').trim().toLowerCase();
  if (!value) return false;
  const domain = value.includes('@') ? value.slice(value.lastIndexOf('@') + 1) : value;
  return BLOCKED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export const TEST_EMAIL_ERROR_MESSAGE =
  "Invalid 'to' field. Please use our testing email address instead of domains like example.com.";

/** True for the known Resend test-domain validation error (expected, not worth alerting on). */
export function isExpectedEmailValidationError(message: string | null | undefined): boolean {
  return /invalid ['"`]?to['"`]? field/i.test(message ?? '') && /testing email address|domains like example\.com/i.test(message ?? '');
}
