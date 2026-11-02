/**
 * End-to-end review-link click tracking:
 *   email link -> /r/{token} -> click recorded -> counters + analytics -> redirect.
 * Runs the real route/handler/analytics code against an in-memory database.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { existsSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { FakeDb, asSupabase } from './helpers/fake-db';

const mockState: { db: FakeDb } = { db: new FakeDb() };
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockState.db }));

/* eslint-disable import/first */
import { GET, HEAD } from '../../app/r/[token]/route';
import {
  anonymiseIp,
  buildTrackingUrl,
  classifyClick,
  isDuplicateClick,
  recordReviewLinkClick,
  resolveClickTarget,
  reviewTrackingUrl,
  visitorHash,
  DEDUPE_WINDOW_MS,
} from '../click-tracking';
import {
  computeClickThroughRate,
  countCountedClicks,
  getCampaignPerformance,
  getClickTimestamps,
  getRecentClicks,
  getReviewLinkTotals,
  summariseCampaigns,
} from '../click-analytics';
import { renderMessage } from '../templates';
/* eslint-enable import/first */

type Client = Parameters<typeof getReviewLinkTotals>[0];

const GOOGLE = 'https://search.google.com/local/writereview?placeid=ChIJabc&hl=en';
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const MSG_ID = '123e4567-e89b-12d3-a456-426614174000';
const HUMAN_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const HOUR_AGO = new Date(Date.now() - 3_600_000).toISOString();

function headers(overrides: Record<string, string> = {}) {
  return { 'user-agent': HUMAN_UA, 'x-forwarded-for': '203.0.113.7', ...overrides };
}
const get = (path: string, h: Record<string, string> = headers(), method = 'GET') =>
  new NextRequest(`https://app.pentriq.test${path}`, { method, headers: h });
const hit = (token: string, h?: Record<string, string>) => GET(get(`/r/${token}`, h), { params: Promise.resolve({ token }) });

function seed(opts: { google?: string | null; enrollment?: boolean } = {}) {
  const db = new FakeDb();
  db.seed('businesses', [{ id: 'b1', google_review_url: opts.google === undefined ? GOOGLE : opts.google }]);
  db.seed('customers', [{ id: 'c1', business_id: 'b1', name: 'Ada Lovelace' }]);
  db.seed('messages', [
    {
      id: MSG_ID,
      tracking_token: TOKEN,
      business_id: 'b1',
      customer_id: 'c1',
      purpose: 'review_request',
      sequence_step: 1,
      status: 'sent',
      sent_at: HOUR_AGO,
      journey_enrollment_id: opts.enrollment ? 'enr1' : null,
      click_count: 0,
      first_clicked_at: null,
      last_clicked_at: null,
    },
  ]);
  if (opts.enrollment) {
    db.seed('journey_enrollments', [{ id: 'enr1', journey_id: 'journey1', status: 'active' }]);
    db.seed('messages', [
      { id: 'reminder1', business_id: 'b1', customer_id: 'c1', journey_enrollment_id: 'enr1', status: 'pending', purpose: 'review_reminder' },
    ]);
  }
  mockState.db = db;
  return db;
}

let db: FakeDb;
beforeEach(() => {
  db = seed();
});

// ---------------------------------------------------------------------------
describe('Test 1: send review request -> click link -> analytics update', () => {
  it('builds the emailed link from the tracking token (never the raw Google URL)', () => {
    const link = reviewTrackingUrl('https://app.pentriq.test/', { id: MSG_ID, tracking_token: TOKEN });
    expect(link).toBe(`https://app.pentriq.test/r/${TOKEN}`);

    const email = renderMessage('review_request', 'email', {
      businessName: 'Sparkle Salon',
      customerName: 'Ada',
      publicReviewUrl: link,
      privateFeedbackUrl: `https://app.pentriq.test/feedback/${MSG_ID}`,
      unsubscribeUrl: 'https://app.pentriq.test/api/unsubscribe/c1',
    });
    expect(email.html).toContain(`href="https://app.pentriq.test/r/${TOKEN}"`);
    expect(email.html).not.toContain('search.google.com');
    expect(email.text).toContain(`/r/${TOKEN}`);
  });

  it('records the click with request, customer, timestamp, user agent, anonymised IP and destination', async () => {
    const res = await hit(TOKEN);
    expect(res.status).toBe(302);

    const [event] = db.rows('interaction_events');
    expect(event).toEqual(
      expect.objectContaining({
        event_type: 'review_link_clicked',
        business_id: 'b1',
        message_id: MSG_ID,
        customer_id: 'c1',
        user_agent: HUMAN_UA,
        ip_address: '203.0.113.0', // last octet dropped
        destination_url: GOOGLE,
      })
    );
    expect(typeof event.occurred_at).toBe('string');
    expect(Number.isNaN(Date.parse(event.occurred_at))).toBe(false);
  });

  it('stores the campaign (journey) id for journey sends', async () => {
    db = seed({ enrollment: true });
    await hit(TOKEN);
    expect(db.rows('interaction_events')[0]).toEqual(expect.objectContaining({ campaign_id: 'journey1' }));
  });

  it('updates counters on the message and flows into analytics', async () => {
    await hit(TOKEN);

    expect(db.rows('messages')[0]).toEqual(
      expect.objectContaining({ click_count: 1, destination_url: GOOGLE })
    );
    expect(db.rows('messages')[0].first_clicked_at).toBeTruthy();
    expect(db.rows('messages')[0].last_clicked_at).toBe(db.rows('messages')[0].first_clicked_at);

    const totals = await getReviewLinkTotals(asSupabase<Client>(db), 'b1');
    expect(totals).toEqual(
      expect.objectContaining({ sent: 1, delivered: 1, clicks: 1, uniqueClicked: 1, clickThroughRate: 100 })
    );
  });
});

// ---------------------------------------------------------------------------
describe('Test 2: multiple clicks', () => {
  const client = () => asSupabase<Parameters<typeof recordReviewLinkClick>[0]>(db);
  const ctx = (now: number, h = headers()) => ({
    method: 'GET',
    headers: new Headers(h),
    destinationUrl: GOOGLE,
    now,
  });
  async function target() {
    const t = await resolveClickTarget(client(), { by: 'token', value: TOKEN });
    if (!t) throw new Error('target missing');
    return t;
  }

  it('counts separate visits, keeping first/last timestamps', async () => {
    const t = await target();
    const t0 = Date.now();
    expect((await recordReviewLinkClick(client(), t, ctx(t0))).outcome).toBe('counted');
    expect((await recordReviewLinkClick(client(), t, ctx(t0 + 60_000))).outcome).toBe('counted');
    expect((await recordReviewLinkClick(client(), t, ctx(t0 + 120_000))).outcome).toBe('counted');

    const msg = db.rows('messages')[0];
    expect(msg.click_count).toBe(3);
    expect(msg.first_clicked_at).toBe(new Date(t0).toISOString());
    expect(msg.last_clicked_at).toBe(new Date(t0 + 120_000).toISOString());
    expect(db.rows('interaction_events')).toHaveLength(3);
  });

  it('ignores an immediate repeat (double-click / prefetch+click) from the same visitor', async () => {
    const t = await target();
    const t0 = Date.now();
    await recordReviewLinkClick(client(), t, ctx(t0));
    const repeat = await recordReviewLinkClick(client(), t, ctx(t0 + 2_000));
    expect(repeat.outcome).toBe('duplicate');
    expect(db.rows('messages')[0].click_count).toBe(1);
    expect(db.rows('interaction_events')).toHaveLength(1);
  });

  it('counts a different visitor inside the dedupe window', async () => {
    const t = await target();
    const t0 = Date.now();
    await recordReviewLinkClick(client(), t, ctx(t0));
    const other = await recordReviewLinkClick(
      client(),
      t,
      ctx(t0 + 1_000, headers({ 'x-forwarded-for': '198.51.100.9', 'user-agent': HUMAN_UA + ' Edg/120' }))
    );
    expect(other.outcome).toBe('counted');
    expect(db.rows('messages')[0].click_count).toBe(2);
  });

  it('counts the same visitor again once the window has passed', async () => {
    const t = await target();
    const t0 = Date.now();
    await recordReviewLinkClick(client(), t, ctx(t0));
    const later = await recordReviewLinkClick(client(), t, ctx(t0 + DEDUPE_WINDOW_MS + 1_000));
    expect(later.outcome).toBe('counted');
  });

  it('keeps total clicks and unique clicked separate in analytics', async () => {
    const t = await target();
    const t0 = Date.now();
    await recordReviewLinkClick(client(), t, ctx(t0));
    await recordReviewLinkClick(client(), t, ctx(t0 + 60_000));
    const totals = await getReviewLinkTotals(asSupabase<Client>(db), 'b1');
    expect(totals.clicks).toBe(2);
    expect(totals.uniqueClicked).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('Test 3: dashboard reflects click metrics', () => {
  it('counts clicks from messages sends (the original bug) and legacy click_events together', async () => {
    db = seed();
    db.seed('review_requests', [{ id: 'rr1', business_id: 'b1', status: 'sent', click_count: 1 }]);
    db.seed('click_events', [{ business_id: 'b1', review_request_id: 'rr1', clicked_at: new Date().toISOString() }]);
    // Historical row written by the old /api/track-message route.
    db.seed('interaction_events', [
      { business_id: 'b1', message_id: MSG_ID, customer_id: 'c1', event_type: 'click', occurred_at: new Date().toISOString() },
    ]);
    await hit(TOKEN); // new-style click

    expect(await countCountedClicks(asSupabase<Client>(db), 'b1')).toBe(3);

    const totals = await getReviewLinkTotals(asSupabase<Client>(db), 'b1');
    expect(totals.sent).toBe(2); // 1 message + 1 legacy review request
    expect(totals.clicks).toBe(3);
    expect(totals.clickThroughRate).toBe(150); // total clicks / delivered * 100
  });

  it('feeds the trend chart from both sources', async () => {
    db = seed();
    db.seed('click_events', [{ business_id: 'b1', review_request_id: 'rr1', clicked_at: '2099-01-01T10:00:00.000Z' }]);
    db.seed('interaction_events', [
      { business_id: 'b1', event_type: 'review_link_clicked', occurred_at: '2099-01-02T10:00:00.000Z' },
      { business_id: 'b1', event_type: 'review_link_scan', occurred_at: '2099-01-03T10:00:00.000Z' },
      { business_id: 'b1', event_type: 'feedback_submitted', occurred_at: '2099-01-04T10:00:00.000Z' },
    ]);
    const stamps = await getClickTimestamps(asSupabase<Client>(db), 'b1', '2098-12-31T00:00:00.000Z', 1000);
    expect(stamps).toEqual(['2099-01-02T10:00:00.000Z', '2099-01-01T10:00:00.000Z']);
  });

  it('computes CTR as clicks / delivered * 100 and is null with nothing delivered', () => {
    expect(computeClickThroughRate(3, 12)).toBe(25);
    expect(computeClickThroughRate(1, 3)).toBe(33.3);
    expect(computeClickThroughRate(0, 10)).toBe(0);
    expect(computeClickThroughRate(5, 0)).toBeNull();
  });

  it('reports campaign performance per sequence step', async () => {
    db = seed();
    db.seed('messages', [
      { id: 'm2', business_id: 'b1', customer_id: 'c1', purpose: 'review_reminder', sequence_step: 2, status: 'sent', click_count: 0 },
      { id: 'm3', business_id: 'b1', customer_id: 'c1', purpose: 'review_request', sequence_step: 1, status: 'queued', click_count: 0 },
    ]);
    await hit(TOKEN);
    const rows = await getCampaignPerformance(asSupabase<Client>(db), 'b1');
    expect(rows).toEqual([
      expect.objectContaining({ key: 'review_request', sent: 1, clicked: 1, totalClicks: 1, clickThroughRate: 100 }),
      expect.objectContaining({ key: 'review_reminder_2', label: 'Reminder 1', sent: 1, clicked: 0, clickThroughRate: 0 }),
    ]);
  });

  it('summariseCampaigns includes the legacy flow and ignores unsent rows', () => {
    const rows = summariseCampaigns(
      [{ purpose: 'review_request', sequence_step: 1, status: 'pending', click_count: 0 }],
      [
        { status: 'sent', click_count: 2 },
        { status: 'sent', click_count: 0 },
      ]
    );
    expect(rows).toEqual([
      expect.objectContaining({ key: 'legacy', sent: 2, clicked: 1, totalClicks: 2, clickThroughRate: 100 }),
    ]);
  });

  it('lists recent clicks with customer names, newest first, excluding scans', async () => {
    db = seed();
    db.seed('interaction_events', [
      { id: 'e1', business_id: 'b1', customer_id: 'c1', event_type: 'review_link_clicked', occurred_at: '2099-01-01T00:00:00.000Z' },
      { id: 'e2', business_id: 'b1', customer_id: 'c1', event_type: 'review_link_clicked', occurred_at: '2099-01-02T00:00:00.000Z' },
      { id: 'e3', business_id: 'b1', customer_id: 'c1', event_type: 'review_link_scan', occurred_at: '2099-01-03T00:00:00.000Z' },
    ]);
    const recent = await getRecentClicks(asSupabase<Client>(db), 'b1', 10);
    expect(recent.map((r) => r.id)).toEqual(['e2', 'e1']);
    expect(recent[0].customerName).toBe('Ada Lovelace');
  });
});

// ---------------------------------------------------------------------------
describe('Test 4: user is redirected after tracking', () => {
  it('302s to the review URL, with the click recorded first, and disables caching', async () => {
    const res = await hit(TOKEN);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(GOOGLE);
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    expect(db.rows('interaction_events')).toHaveLength(1);
  });

  it('still redirects when recording fails (analytics must never break the link)', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.failInsert = () => 'boom';
    const res = await hit(TOKEN);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(GOOGLE);
    quiet.mockRestore();
  });

  it('sends unknown or malformed tokens to the branded page', async () => {
    for (const token of ['does-not-exist-0000000000', 'x', '../../etc/passwd']) {
      const res = await hit(token);
      expect(res.headers.get('location')).toContain('/review-unavailable?reason=invalid-link');
    }
    expect(db.rows('interaction_events')).toHaveLength(0);
  });

  it('shows the branded page, yet counts the click, when no review URL is configured', async () => {
    db = seed({ google: '' });
    const res = await hit(TOKEN);
    expect(res.headers.get('location')).toBe('https://app.pentriq.test/review-unavailable?reason=not-configured');
    expect(db.rows('messages')[0].click_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('Test 5: the Google review link still opens normally', () => {
  it('redirects to the exact destination, query string and all', async () => {
    const res = await hit(TOKEN);
    expect(res.headers.get('location')).toBe(GOOGLE);
    expect(new URL(res.headers.get('location')!).searchParams.get('placeid')).toBe('ChIJabc');
  });

  it('redirects bots and link checkers to the same place (they just are not counted)', async () => {
    const bot = await hit(TOKEN, headers({ 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }));
    expect(bot.status).toBe(302);
    expect(bot.headers.get('location')).toBe(GOOGLE);
    const head = await HEAD(get(`/r/${TOKEN}`, headers(), 'HEAD'), { params: Promise.resolve({ token: TOKEN }) });
    expect(head.headers.get('location')).toBe(GOOGLE);
  });
});

// ---------------------------------------------------------------------------
describe('bots, scanners and previews', () => {
  it('logs scanner hits as review_link_scan and does not count them', async () => {
    await hit(TOKEN, headers({ 'user-agent': 'Mozilla/5.0 (compatible; Proofpoint URL Defense)' }));
    await hit(TOKEN, headers({ 'user-agent': 'python-requests/2.31' }));
    await hit(TOKEN, headers({ purpose: 'prefetch' }));

    expect(db.rows('interaction_events').map((e) => e.event_type)).toEqual([
      'review_link_scan',
      'review_link_scan',
      'review_link_scan',
    ]);
    expect(db.rows('messages')[0].click_count).toBe(0);
    const totals = await getReviewLinkTotals(asSupabase<Client>(db), 'b1');
    expect(totals.clicks).toBe(0);
    expect(totals.clickThroughRate).toBe(0);
  });

  it('does not stop the follow-up reminders on a scan, but does on a real click', async () => {
    db = seed({ enrollment: true });
    await hit(TOKEN, headers({ 'user-agent': 'Barracuda Sentinel' }));
    expect(db.rows('journey_enrollments')[0].status).toBe('active');
    expect(db.rows('messages').find((m) => m.id === 'reminder1')!.status).toBe('pending');

    await hit(TOKEN);
    expect(db.rows('journey_enrollments')[0].status).toBe('exited');
    expect(db.rows('messages').find((m) => m.id === 'reminder1')!.status).toBe('cancelled');
  });

  it('writes nothing for HEAD probes', async () => {
    await HEAD(get(`/r/${TOKEN}`, headers(), 'HEAD'), { params: Promise.resolve({ token: TOKEN }) });
    expect(db.rows('interaction_events')).toHaveLength(0);
  });

  it('treats a click within seconds of sending as a delivery-time scan', () => {
    const now = Date.now();
    const h = new Headers(headers());
    expect(classifyClick({ method: 'GET', headers: h, sentAt: new Date(now - 1_000).toISOString(), now })).toEqual({
      automated: true,
      reason: 'too-soon-after-send',
    });
    expect(classifyClick({ method: 'GET', headers: h, sentAt: new Date(now - 60_000).toISOString(), now })).toEqual({
      automated: false,
    });
  });

  it('classifies common automation user agents and missing UAs', () => {
    const bots = [
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      'Slackbot-LinkExpanding 1.0',
      'facebookexternalhit/1.1',
      'curl/8.4.0',
      'Go-http-client/2.0',
      'Mozilla/5.0 HeadlessChrome/120.0',
      'Mimecast-Link-Scanner',
      'Mozilla/5.0 (Windows NT 10.0) Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0)',
    ];
    for (const ua of bots) {
      expect(classifyClick({ method: 'GET', headers: new Headers({ 'user-agent': ua }) }).automated).toBe(true);
    }
    expect(classifyClick({ method: 'GET', headers: new Headers() })).toEqual({ automated: true, reason: 'missing-user-agent' });
    for (const ua of [
      HUMAN_UA,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    ]) {
      expect(classifyClick({ method: 'GET', headers: new Headers({ 'user-agent': ua }) }).automated).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
describe('privacy helpers and dedupe rule', () => {
  it('anonymises IPv4 and IPv6 addresses', () => {
    expect(anonymiseIp('203.0.113.77')).toBe('203.0.113.0');
    expect(anonymiseIp('::ffff:198.51.100.23')).toBe('198.51.100.0');
    expect(anonymiseIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::');
    expect(anonymiseIp('2001:db8::1')).toBe('2001:db8::');
    expect(anonymiseIp('')).toBeNull();
    expect(anonymiseIp(null)).toBeNull();
    expect(anonymiseIp('garbage')).toBeNull();
  });

  it('visitorHash is stable and sensitive to IP and UA', () => {
    expect(visitorHash('1.2.3.0', 'ua')).toBe(visitorHash('1.2.3.0', 'ua'));
    expect(visitorHash('1.2.3.0', 'ua')).not.toBe(visitorHash('1.2.4.0', 'ua'));
    expect(visitorHash('1.2.3.0', 'ua')).not.toBe(visitorHash('1.2.3.0', 'other'));
  });

  it('isDuplicateClick only matches the same visitor inside the window', () => {
    const now = Date.now();
    const recent = [{ occurred_at: new Date(now - 5_000).toISOString(), metadata: { visitor: 'v1' } }];
    expect(isDuplicateClick(recent, 'v1', now)).toBe(true);
    expect(isDuplicateClick(recent, 'v2', now)).toBe(false);
    expect(isDuplicateClick(recent, 'v1', now + DEDUPE_WINDOW_MS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('backwards compatibility', () => {
  it('falls back to the row id when a row has no tracking token yet, and /r/ resolves it', async () => {
    expect(reviewTrackingUrl('https://app.pentriq.test', { id: MSG_ID })).toBe(`https://app.pentriq.test/r/${MSG_ID}`);
    const res = await hit(MSG_ID);
    expect(res.headers.get('location')).toBe(GOOGLE);
    expect(db.rows('interaction_events')).toHaveLength(1);
  });

  it('resolves legacy review_requests by token and counts the click on the request', async () => {
    db = seed();
    db.seed('review_requests', [
      { id: 'rr-1', tracking_token: 'legacytoken0000000000000000000000', business_id: 'b1', customer_id: 'c1', status: 'sent', sent_at: HOUR_AGO, click_count: 0 },
    ]);
    const res = await hit('legacytoken0000000000000000000000');
    expect(res.headers.get('location')).toBe(GOOGLE);
    expect(db.rows('review_requests')[0].click_count).toBe(1);
    expect(db.rows('interaction_events')[0]).toEqual(
      expect.objectContaining({ review_request_id: 'rr-1', message_id: null, event_type: 'review_link_clicked' })
    );
  });

  it('still counts the click (legacy shape) if migration 0018 is not applied yet', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.failInsert = (_table, row) => (row.event_type === 'review_link_clicked' ? 'violates check constraint' : null);
    const res = await hit(TOKEN);
    expect(res.status).toBe(302);
    expect(db.rows('interaction_events')).toEqual([expect.objectContaining({ event_type: 'click', message_id: MSG_ID })]);
    expect(await countCountedClicks(asSupabase<Client>(db), 'b1')).toBe(1);
    quiet.mockRestore();
  });
});

// ---------------------------------------------------------------------------
describe('no 404 for review links (regression)', () => {
  const app = join(__dirname, '../../app');

  it('has a route file for every URL an email can contain', () => {
    for (const file of [
      'r/[token]/route.ts',
      'r/route.ts',
      'api/track/[reviewRequestId]/route.ts',
      'api/track-message/[messageId]/route.ts',
      'review-unavailable/page.tsx',
    ]) {
      expect(existsSync(join(app, file))).toBe(true);
    }
  });

  it('generated link -> request -> redirect -> analytics, end to end', async () => {
    const link = buildTrackingUrl('https://app.pentriq.test', { id: MSG_ID, tracking_token: TOKEN }, { source: 'test', kind: 'message' });
    const url = new URL(link);
    expect(url.pathname).toBe(`/r/${TOKEN}`);

    const token = url.pathname.split('/')[2];
    const res = await hit(token);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(GOOGLE);
    expect((await getReviewLinkTotals(asSupabase<Client>(db), 'b1')).clicks).toBe(1);
  });

  it('never answers 404: every kind of link, known or not, redirects', async () => {
    db = seed();
    db.seed('review_requests', [{ id: 'rr-9', tracking_token: 'legacytoken9999999999999999999999', business_id: 'b1', customer_id: 'c1', status: 'sent', sent_at: HOUR_AGO, click_count: 0 }]);
    const refs = [TOKEN, MSG_ID, 'legacytoken9999999999999999999999', 'unknownunknownunknown0000', 'x', '%20', 'a'.repeat(200)];
    for (const ref of refs) {
      const res = await hit(ref);
      expect([302, 307, 308]).toContain(res.status);
      expect(res.headers.get('location')).toMatch(/^https:\/\/(search\.google\.com|app\.pentriq\.test\/review-unavailable)/);
    }
  });

  it('still redirects to the branded page when the database lookup itself errors', async () => {
    const broken = { from: () => { throw new Error('db down'); } };
    mockState.db = broken as unknown as FakeDb;
    const quiet = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await hit(TOKEN);
    quiet.mockRestore();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://app.pentriq.test/review-unavailable?reason=invalid-link');
  });

  it('logs the whole lifecycle: url, request, lookup, click, redirect', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    buildTrackingUrl('https://app.pentriq.test', { id: MSG_ID, tracking_token: TOKEN }, { source: 'test', kind: 'message' });
    await hit(TOKEN);
    const lines = log.mock.calls.map((c) => String(c[0]));
    log.mockRestore();

    const stages = lines.filter((l) => l.startsWith('[review-link] ')).map((l) => l.split(' ')[1]);
    expect(stages).toEqual(['url_generated', 'request', 'lookup', 'click', 'redirect']);
    expect(lines.find((l) => l.includes(' url_generated '))).toContain(`https://app.pentriq.test/r/${TOKEN}`);
    expect(lines.find((l) => l.includes(' lookup '))).toContain('"found":true');
    expect(lines.find((l) => l.includes(' redirect '))).toContain(GOOGLE);
  });

  it('logs why a lookup failed', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await hit('unknownunknownunknown0000');
    const lines = log.mock.calls.map((c) => String(c[0]));
    log.mockRestore();
    expect(lines.find((l) => l.includes(' lookup '))).toContain('"reason":"no-matching-row"');
    expect(lines.find((l) => l.includes(' redirect '))).toContain('lookup-failed');
  });
});
