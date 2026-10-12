/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const captured: { error: Error; tags: Record<string, string> }[] = [];
let scopeTags: Record<string, string> = {};
const setUser = jest.fn();
const setTag = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  withScope: (fn: (s: { setTag: (k: string, v: string) => void }) => void) => {
    scopeTags = {};
    fn({ setTag: (k, v) => (scopeTags[k] = v) });
  },
  captureException: (error: Error) => captured.push({ error, tags: { ...scopeTags } }),
  setUser: (...a: unknown[]) => setUser(...a),
  setTag: (...a: unknown[]) => setTag(...a),
}));

import { captureError, setErrorContext } from '@/lib/monitoring';
import { scrub } from '@/lib/sentry-options';
import GlobalError from '@/app/global-error';

beforeEach(() => {
  captured.length = 0;
  setUser.mockClear();
  setTag.mockClear();
  jest.restoreAllMocks();
});

describe('captureError', () => {
  it('tags the area and ids, skips empty tags, and accepts Supabase-style error objects', () => {
    captureError({ message: 'permission denied', code: '42501' }, { area: 'cron:x', tags: { business_id: 'b1', stripe_customer_id: undefined } });
    expect(captured).toHaveLength(1);
    expect(captured[0].error.message).toBe('permission denied');
    expect(captured[0].tags).toEqual({ area: 'cron:x', business_id: 'b1', error_code: '42501' });
  });
});

describe('setErrorContext', () => {
  it('attaches only the user id and business id, never an email or name', () => {
    setErrorContext('user-1', 'biz-1');
    expect(setUser).toHaveBeenCalledWith({ id: 'user-1' });
    expect(setTag).toHaveBeenCalledWith('business_id', 'biz-1');
  });
});

describe('scrub (what is stripped before anything leaves the server)', () => {
  it('removes query strings (cron ?secret=), cookies, bodies and credential headers', () => {
    const out = scrub({
      type: undefined,
      request: {
        url: 'https://pentriq.cloud/api/send-messages?secret=TOPSECRET',
        query_string: 'secret=TOPSECRET',
        cookies: { 'sb-x-auth-token': 'jwt' },
        data: { email: 'jane@example.com' },
        headers: { authorization: 'Bearer abc', 'stripe-signature': 't=1', cookie: 'a=b', 'user-agent': 'x' },
      },
    });
    expect(JSON.stringify(out)).not.toMatch(/TOPSECRET|jwt|jane@example|Bearer|t=1|a=b/);
    expect(out.request?.url).toBe('https://pentriq.cloud/api/send-messages');
    expect(out.request?.headers).toEqual({ 'user-agent': 'x' });
  });
});

describe('React rendering errors (global error boundary)', () => {
  it('reports the error to Sentry and shows a friendly message with the reference', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    const root = createRoot(host);
    const err = Object.assign(new Error('render exploded'), { digest: 'abc123' });
    await act(async () => root.render(React.createElement(GlobalError, { error: err })));
    expect(captured.map((c) => c.error.message)).toEqual(['render exploded']);
    expect(host.textContent).toContain('Something went wrong');
    expect(host.textContent).toContain('abc123');
    act(() => root.unmount());
  });
});
