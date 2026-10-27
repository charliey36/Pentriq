import { beforeAll, describe, expect, it } from '@jest/globals';
import { square, isFinishedBooking } from '@/lib/booking-sync/square';
import { acuity, isFinishedAppointment } from '@/lib/booking-sync/acuity';
import { calendly } from '@/lib/booking-sync/calendly';
import { ReconnectRequired, type FetchLike } from '@/lib/booking-sync/types';
import { FIRST_SYNC_DAYS, describeOutcome, syncBookingConnection, syncWindow } from '@/lib/booking-sync/sync';
import { encryptToken } from '@/lib/google-token-crypto';
import { MiniDb } from './helpers/mini-db';

beforeAll(() => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  Object.assign(process.env, { SQUARE_CLIENT_ID: 'sq-id', SQUARE_CLIENT_SECRET: 'sq-secret', ACUITY_CLIENT_ID: 'ac-id', ACUITY_CLIENT_SECRET: 'ac-secret', CALENDLY_CLIENT_ID: 'ca-id', CALENDLY_CLIENT_SECRET: 'ca-secret' });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
/** Routes URL substrings to canned responses and records every call. */
function mockFetch(routes: Record<string, unknown | ((url: string, init?: RequestInit) => Response)>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return json({ error: 'unrouted' }, 404);
    const r = routes[key];
    return typeof r === 'function' ? (r as (u: string, i?: RequestInit) => Response)(url, init) : json(r);
  };
  return { f, calls };
}
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const dateOf = (iso: string) => iso.slice(0, 10);

describe('OAuth URLs', () => {
  it('Square: read-only scopes, state and redirect', () => {
    const u = new URL(square.authorizeUrl('st', 'https://app.example/cb'));
    expect(u.pathname).toBe('/oauth2/authorize');
    expect(u.searchParams.get('client_id')).toBe('sq-id');
    expect(u.searchParams.get('scope')).toMatch(/APPOINTMENTS_READ.*CUSTOMERS_READ/);
    expect(u.searchParams.get('scope')).not.toMatch(/WRITE/);
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.example/cb');
  });
  it('Acuity and Calendly build their authorize URLs', () => {
    const a = new URL(acuity.authorizeUrl('st', 'https://app.example/cb'));
    expect(a.origin + a.pathname).toBe('https://acuityscheduling.com/oauth2/authorize');
    expect(a.searchParams.get('scope')).toBe('api-v1');
    const c = new URL(calendly.authorizeUrl('st', 'https://app.example/cb'));
    expect(c.origin + c.pathname).toBe('https://auth.calendly.com/oauth/authorize');
    expect(c.searchParams.get('response_type')).toBe('code');
  });
  it('providers are unavailable until their credentials exist', () => {
    const saved = process.env.ACUITY_CLIENT_ID;
    delete process.env.ACUITY_CLIENT_ID;
    expect(acuity.isConfigured()).toBe(false);
    process.env.ACUITY_CLIENT_ID = saved;
  });
  it('code exchange parses tokens; a rejected exchange asks the owner to reconnect', async () => {
    const ok = mockFetch({ '/oauth2/token': { access_token: 'AT', refresh_token: 'RT', expires_at: '2030-01-01T00:00:00Z', merchant_id: 'M1' } });
    expect(await square.exchangeCode('code', 'https://app.example/cb', ok.f)).toMatchObject({ accessToken: 'AT', refreshToken: 'RT', expiresAt: '2030-01-01T00:00:00Z' });
    expect(JSON.parse(String(ok.calls[0].init?.body))).toMatchObject({ grant_type: 'authorization_code', code: 'code', client_secret: 'sq-secret' });
    const bad = mockFetch({ '/oauth2/token': () => json({}, 400) });
    await expect(acuity.exchangeCode('c', 'r', bad.f)).rejects.toBeInstanceOf(ReconnectRequired);
    const cal = mockFetch({ '/oauth/token': { access_token: 'CT', refresh_token: 'CR', expires_in: 7200 } });
    const t = await calendly.exchangeCode('c', 'r', cal.f);
    expect(t.refreshToken).toBe('CR');
    expect(Date.parse(t.expiresAt!)).toBeGreaterThan(Date.now());
  });
});

describe('Square', () => {
  const finished = { id: 'b1', status: 'ACCEPTED', start_at: hoursAgo(30), customer_id: 'c1', appointment_segments: [{ service_variation_id: 'v1', team_member_id: 't1', duration_minutes: 60 }] };
  it('only finished, accepted bookings count', () => {
    expect(isFinishedBooking(finished)).toBe(true);
    expect(isFinishedBooking({ ...finished, status: 'CANCELLED_BY_CUSTOMER' })).toBe(false);
    expect(isFinishedBooking({ ...finished, status: 'NO_SHOW' })).toBe(false);
    expect(isFinishedBooking({ ...finished, start_at: new Date(Date.now() + 3_600_000).toISOString() })).toBe(false);
    expect(isFinishedBooking({ ...finished, start_at: new Date(Date.now() - 30 * 60_000).toISOString() })).toBe(false); // 60 min booking started 30 min ago
  });
  it('maps bookings to import rows with service and staff, skips customers without email', async () => {
    const { f, calls } = mockFetch({
      '/v2/bookings': { bookings: [finished, { ...finished, id: 'b2', customer_id: 'c2' }, { ...finished, id: 'b3', status: 'CANCELLED_BY_SELLER' }] },
      '/v2/customers/c1': { customer: { given_name: 'Sam', family_name: 'Taylor', email_address: 'sam@x.com', phone_number: '+447700900123' } },
      '/v2/customers/c2': { customer: { given_name: 'No', family_name: 'Email' } },
      '/v2/catalog/batch-retrieve': { objects: [{ id: 'v1', item_variation_data: { name: 'Regular', item_id: 'i1' } }], related_objects: [{ id: 'i1', item_data: { name: 'Haircut' } }] },
      '/v2/team-members/t1': { team_member: { given_name: 'Alex', family_name: 'Jones' } },
    });
    const r = await square.fetchCompleted('TOKEN', { from: new Date(Date.now() - 5 * 86_400_000), to: new Date() }, f);
    expect(r.rows).toEqual([{ name: 'Sam Taylor', email: 'sam@x.com', phone: '+447700900123', service: 'Haircut', date: dateOf(finished.start_at), amountSpent: null, staff: 'Alex Jones' }]);
    expect(r.skippedNoEmail).toBe(1);
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer TOKEN' });
  });
  it('splits long ranges into windows of at most 31 days and follows cursors', async () => {
    let page = 0;
    const { f, calls } = mockFetch({ '/v2/bookings': (url: string) => { page += 1; return json(url.includes('cursor=') ? { bookings: [] } : { bookings: [], cursor: 'next' }); } });
    await square.fetchCompleted('T', { from: new Date(Date.now() - 70 * 86_400_000), to: new Date() }, f);
    const lists = calls.filter((c) => c.url.includes('/v2/bookings'));
    expect(lists.length).toBe(6); // 3 windows x (first page + cursor page)
    for (const c of lists) {
      const u = new URL(c.url);
      const span = Date.parse(u.searchParams.get('start_at_max')!) - Date.parse(u.searchParams.get('start_at_min')!);
      expect(span).toBeLessThanOrEqual(31 * 86_400_000);
    }
    expect(page).toBe(6);
  });
  it('a revoked token asks the owner to reconnect; missing staff permission does not break the sync', async () => {
    const revoked = mockFetch({ '/v2/bookings': () => json({}, 401) });
    await expect(square.fetchCompleted('T', { from: new Date(Date.now() - 86_400_000), to: new Date() }, revoked.f)).rejects.toBeInstanceOf(ReconnectRequired);
    const noStaff = mockFetch({
      '/v2/bookings': { bookings: [finished] },
      '/v2/customers/c1': { customer: { given_name: 'Sam', email_address: 'sam@x.com' } },
      '/v2/catalog/batch-retrieve': { objects: [] },
      '/v2/team-members/t1': () => json({}, 403),
    });
    const r = await square.fetchCompleted('T', { from: new Date(Date.now() - 5 * 86_400_000), to: new Date() }, noStaff.f);
    expect(r.rows[0]).toMatchObject({ email: 'sam@x.com', service: 'Appointment' });
    expect(r.rows[0]).not.toHaveProperty('staff');
  });
});

describe('Acuity', () => {
  const appt = { id: 1, firstName: 'Priya', lastName: 'Shah', email: 'priya@x.com', phone: '07700 900111', datetime: hoursAgo(30), duration: '30', type: 'Consultation', calendar: 'Dr Lee', price: '85.00', canceled: false };
  it('finished means not cancelled, not a no-show and already over', () => {
    expect(isFinishedAppointment(appt)).toBe(true);
    expect(isFinishedAppointment({ ...appt, canceled: true })).toBe(false);
    expect(isFinishedAppointment({ ...appt, noShow: true })).toBe(false);
    expect(isFinishedAppointment({ ...appt, datetime: new Date(Date.now() + 3_600_000).toISOString() })).toBe(false);
  });
  it('maps appointments (price, calendar as staff) and de-duplicates across windows', async () => {
    const { f, calls } = mockFetch({ '/api/v1/appointments': [appt, { ...appt, id: 2, email: '', firstName: 'Anon' }, { ...appt, id: 3, noShow: true }] });
    const r = await acuity.fetchCompleted('T', { from: new Date(Date.now() - 16 * 86_400_000), to: new Date() }, f);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(new URL(calls[0].url).searchParams.get('canceled')).toBe('false');
    expect(r.rows).toEqual([{ name: 'Priya Shah', email: 'priya@x.com', phone: '07700 900111', service: 'Consultation', date: dateOf(appt.datetime), amountSpent: '85.00', staff: 'Dr Lee' }]); // id 1 returned by every window, kept once
    expect(r.skippedNoEmail).toBe(1);
  });
  it('401 means reconnect', async () => {
    const { f } = mockFetch({ '/api/v1/appointments': () => json({}, 401) });
    await expect(acuity.fetchCompleted('T', { from: new Date(Date.now() - 86_400_000), to: new Date() }, f)).rejects.toBeInstanceOf(ReconnectRequired);
  });
});

describe('Calendly', () => {
  const done = { uri: 'https://api.calendly.com/scheduled_events/E1', name: '30 Minute Meeting', start_time: hoursAgo(30), end_time: hoursAgo(29), status: 'active', event_memberships: [{ user_name: 'Host Person' }] };
  const future = { ...done, uri: 'https://api.calendly.com/scheduled_events/E2', start_time: new Date(Date.now() + 3_600_000).toISOString(), end_time: new Date(Date.now() + 7_200_000).toISOString() };
  it('imports invitees of finished meetings only', async () => {
    const { f } = mockFetch({
      '/users/me': { resource: { uri: 'https://api.calendly.com/users/U1' } },
      '/scheduled_events/E1/invitees': { collection: [{ name: 'Jo Bloggs', email: 'jo@x.com', text_reminder_number: '+447700900999' }, { name: 'No Mail' }] },
      '/scheduled_events?': { collection: [done, future], pagination: { next_page_token: null } },
    });
    const r = await calendly.fetchCompleted('T', { from: new Date(Date.now() - 5 * 86_400_000), to: new Date(Date.now() + 86_400_000) }, f);
    expect(r.rows).toEqual([{ name: 'Jo Bloggs', email: 'jo@x.com', phone: '+447700900999', service: '30 Minute Meeting', date: dateOf(done.start_time), amountSpent: null, staff: 'Host Person' }]);
    expect(r.skippedNoEmail).toBe(1);
  });
});

describe('sync window', () => {
  it('first sync looks back 60 days; later syncs resume from the last sync with a day of overlap', () => {
    const now = new Date('2026-10-27T10:00:00Z');
    expect(syncWindow(null, now).from.toISOString()).toBe(new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000).toISOString());
    expect(syncWindow('2026-10-26T07:30:00Z', now).from.toISOString()).toBe('2026-10-25T07:30:00.000Z');
    expect(syncWindow('not a date', now).from.getTime()).toBeLessThan(now.getTime() - 59 * 86_400_000);
  });
  it('describes the outcome in plain words', () => {
    expect(describeOutcome({ visitsAdded: 1, customersCreated: 0, skippedNoEmail: 2, queued: 1 })).toBe('1 new appointment, 0 new customers, 1 review request scheduled, 2 skipped (no email address)');
  });
});

describe('syncBookingConnection (end to end with a mocked provider)', () => {
  const NOW = new Date();
  const appt = (id: number, email: string, hours = 30) => ({ id, firstName: 'Cust', lastName: String(id), email, datetime: hoursAgo(hours), duration: '30', type: 'Repair', calendar: 'Alex', price: '50', canceled: false });
  function setup(extra: Record<string, unknown> = {}) {
    const db = new MiniDb();
    db.rows('businesses').push({ id: 'b1', delay_hours: 2, review_request_window_days: 14, review_cooldown_enabled: false, review_cooldown_days: 30 });
    db.rows('booking_connections').push({ id: 'bc1', business_id: 'b1', provider: 'acuity', status: 'active', access_token_enc: encryptToken('TOKEN'), refresh_token_enc: null, token_expires_at: null, consent_confirmed_at: '2026-10-01T00:00:00Z', last_synced_at: null, ...extra });
    return db;
  }
  const conn = (db: MiniDb) => db.rows('booking_connections')[0] as never;

  it('imports customers, visits and review requests, and records the sync', async () => {
    const db = setup();
    const { f } = mockFetch({ '/api/v1/appointments': [appt(1, 'a@x.com'), appt(2, 'b@x.com')] });
    const out = await syncBookingConnection(db as never, conn(db), { now: NOW, fetch: f });
    expect(out).toMatchObject({ status: 'ok', customersCreated: 2, visitsAdded: 2, queued: 2 });
    expect(db.rows('customers').map((c) => c.email).sort()).toEqual(['a@x.com', 'b@x.com']);
    expect(db.rows('customers')[0].consent_confirmed_at).toBe('2026-10-01T00:00:00Z');
    expect(db.rows('visits')[0]).toMatchObject({ staff_name: 'Alex', price: 50 });
    expect(db.rows('messages').filter((m) => m.purpose === 'review_request' && m.status === 'pending')).toHaveLength(2);
    expect(db.rows('booking_connections')[0]).toMatchObject({ last_sync_status: 'ok', last_synced_at: NOW.toISOString() });
  });

  it('syncing again adds nothing, creates no duplicate requests and does not inflate the duplicate counter', async () => {
    const db = setup();
    const { f } = mockFetch({ '/api/v1/appointments': [appt(1, 'a@x.com')] });
    await syncBookingConnection(db as never, conn(db), { now: NOW, fetch: f });
    const again = await syncBookingConnection(db as never, conn(db), { now: new Date(NOW.getTime() + 3_600_000), fetch: f });
    expect(again).toMatchObject({ status: 'ok', visitsAdded: 0, customersCreated: 0 });
    expect(db.rows('visits')).toHaveLength(1);
    expect(db.rows('messages').filter((m) => m.purpose === 'review_request')).toHaveLength(1);
    expect(db.rows('review_request_blocks')).toHaveLength(0);
  });

  it('respects opt-outs: an unsubscribed customer is imported but never scheduled', async () => {
    const db = setup();
    db.rows('customers').push({ id: 'c9', business_id: 'b1', name: 'Out', email: 'out@x.com', phone: null, total_spend: 0, visit_count: 0, last_service_date: null, unsubscribed_at: '2026-01-01T00:00:00Z' });
    const { f } = mockFetch({ '/api/v1/appointments': [appt(1, 'out@x.com')] });
    const out = await syncBookingConnection(db as never, conn(db), { now: NOW, fetch: f });
    expect(out.queued).toBe(0);
    expect(db.rows('review_request_blocks').map((b) => b.reason)).toEqual(['opt_out']);
  });

  it('a revoked token marks the connection needs_reconnect instead of failing the whole job', async () => {
    const db = setup();
    const { f } = mockFetch({ '/api/v1/appointments': () => json({}, 401) });
    const out = await syncBookingConnection(db as never, conn(db), { now: NOW, fetch: f });
    expect(out.status).toBe('reconnect');
    expect(db.rows('booking_connections')[0]).toMatchObject({ status: 'needs_reconnect', last_sync_status: 'reconnect' });
  });

  it('other failures are recorded and keep the connection active for tomorrow', async () => {
    const db = setup();
    const { f } = mockFetch({ '/api/v1/appointments': () => json({}, 500) });
    const out = await syncBookingConnection(db as never, conn(db), { now: NOW, fetch: f });
    expect(out.status).toBe('error');
    expect(db.rows('booking_connections')[0]).toMatchObject({ status: 'active', last_sync_status: 'error' });
    expect(db.rows('booking_connections')[0].last_synced_at).toBeNull(); // retry the same window next time
  });

  it('refreshes an expiring token and stores the new one encrypted', async () => {
    const db = setup({ provider: 'square', refresh_token_enc: encryptToken('OLD_REFRESH'), token_expires_at: new Date(NOW.getTime() + 60_000).toISOString() });
    const { f, calls } = mockFetch({
      '/oauth2/token': { access_token: 'NEW_AT', refresh_token: 'NEW_RT', expires_at: '2031-01-01T00:00:00Z' },
      '/v2/bookings': { bookings: [] },
    });
    const out = await syncBookingConnection(db as never, conn(db), { now: NOW, fetch: f });
    expect(out.status).toBe('ok');
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'OLD_REFRESH' });
    const stored = db.rows('booking_connections')[0];
    expect(stored.access_token_enc).not.toContain('NEW_AT'); // encrypted at rest
    expect(stored.token_expires_at).toBe('2031-01-01T00:00:00Z');
    expect(calls[1].init?.headers).toMatchObject({ Authorization: 'Bearer NEW_AT' });
  });

  it('an expired token with no refresh route asks for reconnect', async () => {
    const db = setup({ token_expires_at: new Date(NOW.getTime() - 1000).toISOString() });
    const out = await syncBookingConnection(db as never, conn(db), { now: NOW, fetch: mockFetch({}).f });
    expect(out.status).toBe('reconnect');
  });

  it('does nothing for disconnected connections or unconfigured providers', async () => {
    const db = setup({ status: 'disconnected', access_token_enc: null });
    expect((await syncBookingConnection(db as never, conn(db), { now: NOW, fetch: mockFetch({}).f })).status).toBe('error');
    const saved = process.env.ACUITY_CLIENT_ID;
    delete process.env.ACUITY_CLIENT_ID;
    const db2 = setup();
    expect((await syncBookingConnection(db2 as never, conn(db2), { now: NOW, fetch: mockFetch({}).f })).message).toMatch(/not configured/);
    process.env.ACUITY_CLIENT_ID = saved;
  });
});
