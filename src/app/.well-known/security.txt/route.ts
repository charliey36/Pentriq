import { ORG, SITE_URL } from '@/lib/site';

/** RFC 9116 security.txt: where to report a vulnerability. Expires rolls forward so it never goes stale. */
export function GET() {
  const expires = new Date(Date.now() + 180 * 86_400_000);
  expires.setUTCHours(0, 0, 0, 0);
  const body = [
    `Contact: mailto:${ORG.email}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en',
    `Policy: ${SITE_URL}/security`,
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
}
