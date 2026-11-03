/**
 * CSRF defence in depth for route handlers that act on the signed-in user's session cookie.
 *
 * Server Actions already get Next.js's built-in origin check, and Supabase's session cookies are SameSite=Lax
 * (so browsers do not attach them to cross-site POSTs). Route handlers get neither check from the framework, so
 * any state-changing handler authenticated by cookie calls this as well: a request that a browser marks as
 * cross-site (Sec-Fetch-Site) or whose Origin is another host is refused.
 */
type HeaderSource = { get(name: string): string | null };

export function isSameOriginRequest(headers: HeaderSource, requestUrl: string): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;

  const origin = headers.get('origin');
  if (!origin) return true; // Non-browser clients have no session cookie to abuse; browsers always send Origin on POST.
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const expected = headers.get('x-forwarded-host') ?? headers.get('host') ?? new URL(requestUrl).host;
  return originHost === expected.split(',')[0].trim();
}
