import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Shared check for the scheduled-job endpoints. The caller must present
 * CRON_SECRET as `Authorization: Bearer <secret>` (what Vercel Cron sends
 * automatically) or, for external schedulers set up before this check existed,
 * as a `?secret=` query parameter. The comparison is constant-time so response
 * timing can't be used to guess the secret.
 *
 * Prefer the header: query strings end up in access logs and browser history.
 */
export function isCronAuthorized(request: NextRequest, expectedSecret: string): boolean {
  const header = request.headers.get('authorization');
  const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const provided = bearer ?? request.nextUrl.searchParams.get('secret');
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expectedSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}
