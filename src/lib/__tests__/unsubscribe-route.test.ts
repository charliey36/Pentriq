/** @jest-environment node */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { FakeDb } from './helpers/fake-db';
import { isOneClickBody, renderUnsubscribePage } from '../unsubscribe-page';

const state: { db: FakeDb; allowed: boolean } = { db: new FakeDb(), allowed: true };
const unsubscribe = jest.fn(async (_db: unknown, id: string) => (id === CUSTOMER ? 'ok' : 'not_found'));

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }));
jest.mock('@/lib/rate-limit', () => ({
  RATE_LIMITS: { unsubscribeIp: { limit: 30, windowSeconds: 600 } },
  requesterId: () => '203.0.113.7',
  withinLimit: async () => state.allowed,
}));
jest.mock('@/lib/unsubscribe', () => ({ unsubscribeCustomer: (db: unknown, id: string) => unsubscribe(db, id) }));

// eslint-disable-next-line import/first
import { GET, POST } from '../../app/api/unsubscribe/[customerId]/route';

const CUSTOMER = '123e4567-e89b-12d3-a456-426614174000';
const params = (id: string) => ({ params: Promise.resolve({ customerId: id }) });
const url = (id: string) => `https://pentriq.cloud/api/unsubscribe/${id}`;

beforeEach(() => {
  state.allowed = true;
  unsubscribe.mockClear();
  state.db = new FakeDb();
  state.db.seed('businesses', [{ id: 'b1', name: 'Glow <Studio>' }]);
  state.db.seed('customers', [{ id: CUSTOMER, business_id: 'b1', unsubscribed_at: null }]);
});

describe('GET (what email security scanners fetch)', () => {
  it('shows a confirmation form and never unsubscribes', async () => {
    const res = await GET(new NextRequest(url(CUSTOMER)), params(CUSTOMER));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<form method="post" action="/api/unsubscribe/123e4567-e89b-12d3-a456-426614174000">');
    expect(html).toContain('Glow &lt;Studio&gt;');
    expect(html).not.toContain('Glow <Studio>');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('says so when the customer is already unsubscribed', async () => {
    state.db = new FakeDb();
    state.db.seed('businesses', [{ id: 'b1', name: 'Glow' }]);
    state.db.seed('customers', [{ id: CUSTOMER, business_id: 'b1', unsubscribed_at: '2026-01-01T00:00:00Z' }]);
    const html = await (await GET(new NextRequest(url(CUSTOMER)), params(CUSTOMER))).text();
    expect(html).toContain('already unsubscribed');
    expect(html).not.toContain('<form');
  });

  it('rejects malformed ids, unknown customers and floods', async () => {
    expect((await GET(new NextRequest(url('nope')), params('nope'))).status).toBe(400);
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await GET(new NextRequest(url(missing)), params(missing))).status).toBe(404);
    state.allowed = false;
    const limited = await GET(new NextRequest(url(CUSTOMER)), params(CUSTOMER));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('600');
  });
});

describe('POST', () => {
  it('unsubscribes from the confirmation form and shows the done page', async () => {
    const res = await POST(new NextRequest(url(CUSTOMER), { method: 'POST', body: 'confirm=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), params(CUSTOMER));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('been unsubscribed');
  });

  it('supports RFC 8058 one-click from mail clients with a plain response', async () => {
    const res = await POST(new NextRequest(url(CUSTOMER), { method: 'POST', body: 'List-Unsubscribe=One-Click' }), params(CUSTOMER));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('Unsubscribed.');
  });

  it('handles unknown customers and rate limits', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await POST(new NextRequest(url(missing), { method: 'POST', body: 'confirm=1' }), params(missing))).status).toBe(404);
    state.allowed = false;
    expect((await POST(new NextRequest(url(CUSTOMER), { method: 'POST', body: 'List-Unsubscribe=One-Click' }), params(CUSTOMER))).status).toBe(429);
  });
});

describe('page helpers', () => {
  it('detects only the one-click body', () => {
    expect(isOneClickBody('List-Unsubscribe=One-Click')).toBe(true);
    expect(isOneClickBody('confirm=1')).toBe(false);
    expect(isOneClickBody('')).toBe(false);
  });

  it('is not indexed and escapes the action path', () => {
    const html = renderUnsubscribePage('confirm', { businessName: null, actionPath: '/x"><script>' });
    expect(html).toContain('noindex');
    expect(html).toContain('this business');
    expect(html).not.toContain('"><script>');
  });
});
