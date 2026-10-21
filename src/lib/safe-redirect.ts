/**
 * Post-login redirect targets must be same-site relative paths. Blocks open redirects such as
 * `//evil.com`, `/\evil.com`, `https://evil.com` and control-character tricks.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\u0000-\u001f]/.test(raw)) return '/dashboard';
  return raw;
}
