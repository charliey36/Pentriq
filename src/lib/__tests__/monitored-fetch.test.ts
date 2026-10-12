import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const captured: { error: Error; tags: Record<string, string> }[] = [];
let scopeTags: Record<string, string> = {};

jest.mock('@sentry/nextjs', () => ({
  withScope: (fn: (s: { setTag: (k: string, v: string) => void }) => void) => {
    scopeTags = {};
    fn({ setTag: (k, v) => (scopeTags[k] = v) });
  },
  captureException: (error: Error) => captured.push({ error, tags: { ...scopeTags } }),
}));

import { monitoredFetch } from '@/lib/supabase/monitored-fetch';

const respond = (status: number, body: unknown = {}) => jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  captured.length = 0;
  jest.restoreAllMocks();
});

describe('monitoredFetch (Supabase failures)', () => {
  it('reports a failed insert/update (400/403) with table, method and DB code, but not the query string', async () => {
    respond(403, { code: '42501', message: 'new row violates row-level security policy' });
    const res = await monitoredFetch('https://x.supabase.co/rest/v1/customers?email=eq.jane@example.com', { method: 'POST' });
    await flush();
    expect(res.status).toBe(403); // caller still gets the untouched response
    expect(await res.json()).toMatchObject({ code: '42501' });
    expect(captured).toHaveLength(1);
    expect(captured[0].tags).toMatchObject({ area: 'supabase:db', method: 'POST', target: 'customers', http_status: '403', error_code: '42501' });
    expect(JSON.stringify(captured)).not.toContain('jane@example.com');
  });
  it('reports server errors and RPC failures, and auth outages', async () => {
    respond(500, { message: 'boom' });
    await monitoredFetch('https://x.supabase.co/rest/v1/rpc/rate_limit_hit', { method: 'POST' });
    respond(503, { msg: 'down' });
    await monitoredFetch('https://x.supabase.co/auth/v1/token', { method: 'POST' });
    await flush();
    expect(captured.map((c) => c.tags.area)).toEqual(['supabase:db', 'supabase:auth']);
    expect(captured[0].tags.target).toBe('rpc:rate_limit_hit');
  });
  it('ignores expected statuses: success, duplicate (409), no rows (404/406) and normal auth failures', async () => {
    for (const [status, url] of [[200, '/rest/v1/a'], [409, '/rest/v1/a'], [404, '/rest/v1/a'], [406, '/rest/v1/a'], [400, '/auth/v1/token'], [401, '/auth/v1/user']] as const) {
      respond(status);
      await monitoredFetch(`https://x.supabase.co${url}`);
    }
    await flush();
    expect(captured).toHaveLength(0);
  });
  it('reports a network failure and rethrows it unchanged', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(monitoredFetch('https://x.supabase.co/rest/v1/messages')).rejects.toThrow('fetch failed');
    expect(captured[0].tags).toMatchObject({ area: 'supabase:network', path: '/rest/v1/messages' });
  });
});
