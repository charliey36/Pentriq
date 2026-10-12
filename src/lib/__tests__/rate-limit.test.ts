import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }));

import { limiterKey, requesterId, withinLimit } from '@/lib/rate-limit';

const rule = { limit: 3, windowSeconds: 60 };

describe('rate limiter', () => {
  it('allows when the database says the caller is within the limit and blocks when it is not', async () => {
    expect(await withinLimit('t', '1.2.3.4', rule, async () => ({ data: true, error: null }))).toBe(true);
    expect(await withinLimit('t', '1.2.3.4', rule, async () => ({ data: false, error: null }))).toBe(false);
  });

  it('passes the window and limit through and never sends the raw IP', async () => {
    const seen: unknown[][] = [];
    await withinLimit('feedback', '203.0.113.9', rule, async (...args) => {
      seen.push(args);
      return { data: true, error: null };
    });
    expect(seen[0][1]).toBe(60);
    expect(seen[0][2]).toBe(3);
    expect(String(seen[0][0])).toMatch(/^feedback:[0-9a-f]{32}$/);
    expect(String(seen[0][0])).not.toContain('203.0.113.9');
  });

  it('fails open when the limiter errors or throws (unsubscribe must keep working)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await withinLimit('t', 'x', rule, async () => ({ data: null, error: { message: 'function does not exist' } }))).toBe(true);
    expect(await withinLimit('t', 'x', rule, async () => { throw new Error('network'); })).toBe(true);
    spy.mockRestore();
  });

  it('keys are stable per identifier and differ between identifiers and scopes', () => {
    expect(limiterKey('a', 'ip1')).toBe(limiterKey('a', 'ip1'));
    expect(limiterKey('a', 'ip1')).not.toBe(limiterKey('a', 'ip2'));
    expect(limiterKey('a', 'ip1')).not.toBe(limiterKey('b', 'ip1'));
  });

  it('reads the client address from proxy headers', () => {
    const h = (v: Record<string, string>) => ({ get: (n: string) => v[n] ?? null });
    expect(requesterId(h({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }))).toBe('198.51.100.7');
    expect(requesterId(h({}))).toBe('unknown');
  });
});
