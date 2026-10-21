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
