import { NextRequest } from 'next/server';
import { isCronAuthorized } from '../cron-auth';

const req = (url: string, headers: Record<string, string> = {}) => new NextRequest(`https://app.example.com${url}`, { headers });
const SECRET = 's3cret-value';

describe('isCronAuthorized', () => {
  it('accepts the Bearer header (what Vercel Cron sends)', () => {
    expect(isCronAuthorized(req('/api/x', { authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
  });

  it('still accepts ?secret= for existing external schedulers', () => {
    expect(isCronAuthorized(req(`/api/x?secret=${SECRET}`), SECRET)).toBe(true);
  });

  it('rejects missing, wrong, and different-length secrets', () => {
    expect(isCronAuthorized(req('/api/x'), SECRET)).toBe(false);
    expect(isCronAuthorized(req('/api/x?secret=nope'), SECRET)).toBe(false);
    expect(isCronAuthorized(req('/api/x', { authorization: 'Bearer ' }), SECRET)).toBe(false);
    expect(isCronAuthorized(req('/api/x', { authorization: `Bearer ${SECRET}x` }), SECRET)).toBe(false);
    expect(isCronAuthorized(req('/api/x', { authorization: SECRET }), SECRET)).toBe(false); // missing "Bearer"
  });

  it('prefers the header over the query string', () => {
    expect(isCronAuthorized(req('/api/x?secret=wrong', { authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
  });
});
