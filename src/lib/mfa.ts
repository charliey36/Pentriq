/**
 * Two-factor authentication (TOTP) policy.
 *
 * Trust model, which matters for MFA to mean anything:
 *  - The session's assurance level (`aal1` = password only, `aal2` = password + authenticator code) is read from
 *    the access token's `aal` claim as returned by getClaims(), which verifies the token's signature.
 *  - Whether the user HAS two-factor set up is NOT read from the cookie session's `user.factors`: that object is
 *    unsigned, so someone holding only a stolen password could delete the factor list from their own cookie and
 *    skip the code step. Instead the server records it in `app_metadata.mfa_enrolled` (writable only with the
 *    service role) after confirming the user's factors with the auth server, and app_metadata is signed into the
 *    access token like every other claim.
 *
 * Enforcement runs on every signed-in request (requireAccess in lib/business.ts), so pages, server actions and
 * route handlers are all covered.
 */

export type MfaGate = 'ok' | 'verify' | 'enroll';

export type MfaGateInput = {
  /** `aal` claim of the verified access token. */
  aal: string | null | undefined;
  /** `app_metadata.mfa_enrolled` claim of the verified access token. */
  userEnrolled: boolean;
  /** The organisation's "everyone must use two-factor" policy (businesses.require_mfa). */
  orgRequires: boolean;
};

/**
 *  - already at aal2: allowed;
 *  - has two-factor set up but signed in with a password only: must enter a code (`verify`);
 *  - the organisation requires two-factor and the user has none yet: must set it up (`enroll`).
 */
export function mfaGate({ aal, userEnrolled, orgRequires }: MfaGateInput): MfaGate {
  if (aal === 'aal2') return 'ok';
  if (userEnrolled) return 'verify';
  if (orgRequires) return 'enroll';
  return 'ok';
}

/**
 * Platform operators (ADMIN_EMAIL) can read and delete every organisation's data through the service role, so the
 * Admin Portal always needs a two-factor session, whatever their own organisation's policy.
 */
export function adminMfaGate(aal: string | null | undefined, userEnrolled: boolean): MfaGate {
  return mfaGate({ aal, userEnrolled, orgRequires: true });
}

export function gateRedirect(gate: Exclude<MfaGate, 'ok'>, next: string): string {
  const encoded = encodeURIComponent(next);
  return gate === 'verify' ? `/mfa?next=${encoded}` : `/account/security?setup=required&next=${encoded}`;
}

/** Reads the enrolment flag from verified claims (app_metadata is set only by the server). */
export function enrolledFromClaims(claims: Record<string, unknown> | null | undefined): boolean {
  const meta = claims?.app_metadata;
  return Boolean(meta && typeof meta === 'object' && (meta as Record<string, unknown>).mfa_enrolled === true);
}

/** A six-digit TOTP code, tolerating the spaces people type ("123 456"). Returns null when not a code. */
export function normaliseTotpCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export const MAX_FACTORS = 5;

/** Friendly names must be unique per user in Supabase; add a short suffix so re-enrolling never collides. */
export function friendlyFactorName(base: string, existing: string[], now: Date = new Date()): string {
  const clean = base.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Authenticator app';
  if (!existing.includes(clean)) return clean;
  return `${clean} (${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)})`;
}
