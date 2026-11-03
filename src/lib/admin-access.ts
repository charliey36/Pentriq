import { adminMfaGate, type MfaGate } from '@/lib/mfa';

/**
 * Admin permission check. Pure (reads ADMIN_EMAIL only) so it can run in middleware, server
 * components, server actions and route handlers. ADMIN_EMAIL is a comma-separated list.
 */
export function isAdminEmail(email: string | undefined | null): boolean {
  const raw = process.env.ADMIN_EMAIL;
  if (!raw || !email) return false;
  const admins = raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export type AdminAccess = 'ok' | 'forbidden' | Exclude<MfaGate, 'ok'>;

/**
 * What every admin page, route and action requires: an ADMIN_EMAIL address AND a two-factor (aal2) session.
 * 'verify' and 'enroll' say where to send an admin who has not passed two-factor yet (see gateRedirect).
 */
export function adminAccess(user: { email: string | null | undefined; aal: string | null | undefined; mfaEnrolled: boolean } | null): AdminAccess {
  if (!user || !isAdminEmail(user.email)) return 'forbidden';
  return adminMfaGate(user.aal, user.mfaEnrolled);
}
