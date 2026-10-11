/**
 * Legacy click-tracking URLs (/api/track-message/[id], /api/track/[id]) must
 * keep working for emails already sent: they delegate to the shared handler,
 * record the click, then redirect to Google; a missing/invalid destination
 * goes to the branded Pentriq page (never a raw 404).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { FakeDb } from './helpers/fake-db';

const mockState: { db: FakeDb } = { db: new FakeDb() };

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockState.db }));

// eslint-disable-next-line import/first
import { GET as trackMessage } from '../../app/api/track-message/[messageId]/route';
// eslint-disable-next-line import/first
import { GET as trackLegacy } from '../../app/api/track/[reviewRequestId]/route';
// eslint-disable-next-line import/first
import { isValidReviewUrl, reviewUnavailableUrl } from '../review-destination';
// eslint-disable-next-line import/first
import { getAppUrl } from '../brand';

const ID = '123e4567-e89b-12d3-a456-426614174000';
const GOOGLE = 'https://g.page/r/abc123/review';
const HUMAN_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const HOUR_AGO = new Date(Date.now() - 3_600_000).toISOString();

const req = (path: string) =>
  new NextRequest(`https://pentriq.cloud${path}`, {
    headers: { 'user-agent': HUMAN_UA, 'x-forwarded-for': '203.0.113.7' },
  });

function seed(googleUrl: string | null = GOOGLE) {
  const db = new FakeDb();
  db.seed('businesses', [{ id: 'b1', google_review_url: googleUrl }]);
  db.seed('messages', [
    { id: ID, business_id: 'b1', customer_id: 'c1', journey_enrollment_id: null, sent_at: HOUR_AGO, click_count: 0 },
  ]);
  db.seed('review_requests', [
    { id: ID, business_id: 'b1', customer_id: 'c1', sent_at: HOUR_AGO, click_count: 0, status: 'sent' },
  ]);
  mockState.db = db;
  return db;
}

beforeEach(() => {
  seed();
});

describe('isValidReviewUrl', () => {
  it('accepts absolute http(s) URLs only', () => {
    expect(isValidReviewUrl(GOOGLE)).toBe(true);
    expect(isValidReviewUrl('http://example.com')).toBe(true);
    for (const bad of ['', '   ', 'g.page/r/abc', 'javascript:alert(1)', 'ftp://x.com', null, undefined, 42]) {
      expect(isValidReviewUrl(bad)).toBe(false);
    }
  });
});

describe('/api/track-message/[messageId] (legacy URL)', () => {
  it('records the click and 302-redirects to the Google review URL', async () => {
    const db = seed();
    const res = await trackMessage(req(`/api/track-message/${ID}`), { params: { messageId: ID } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(GOOGLE);
    expect(db.rows('interaction_events')).toEqual([
      expect.objectContaining({ message_id: ID, event_type: 'review_link_clicked', business_id: 'b1', customer_id: 'c1' }),
    ]);
  });

  it('shows the branded page (not a 404) when no review URL is configured, still counting the click', async () => {
    const db = seed(null);
    const res = await trackMessage(req(`/api/track-message/${ID}`), { params: { messageId: ID } });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toBe('https://pentriq.cloud/review-unavailable?reason=not-configured');
    expect(db.rows('interaction_events')).toHaveLength(1);
  });

  it('treats a malformed review URL as not configured', async () => {
    seed('not a url');
    const res = await trackMessage(req(`/api/track-message/${ID}`), { params: { messageId: ID } });
    expect(res.headers.get('location')).toContain('/review-unavailable?reason=not-configured');
  });

  it('sends unknown / malformed ids to the branded page without recording anything', async () => {
    const db = seed();
    db.tables.messages = [];
    const unknown = await trackMessage(req(`/api/track-message/${ID}`), { params: { messageId: ID } });
    expect(unknown.headers.get('location')).toContain('/review-unavailable?reason=invalid-link');
    const bad = await trackMessage(req('/api/track-message/nope'), { params: { messageId: 'nope' } });
    expect(bad.headers.get('location')).toContain('/review-unavailable?reason=invalid-link');
    expect(db.rows('interaction_events')).toHaveLength(0);
  });
});

describe('/api/track/[reviewRequestId] (legacy URL)', () => {
  it('records the click against the review request and redirects to Google', async () => {
    const db = seed();
    const res = await trackLegacy(req(`/api/track/${ID}`), { params: { reviewRequestId: ID } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(GOOGLE);
    expect(db.rows('interaction_events')[0]).toEqual(
      expect.objectContaining({ review_request_id: ID, message_id: null, event_type: 'review_link_clicked' })
    );
    expect(db.rows('review_requests')[0]).toEqual(expect.objectContaining({ click_count: 1 }));
  });

  it('shows the branded page when no review URL is configured', async () => {
    seed('');
    const res = await trackLegacy(req(`/api/track/${ID}`), { params: { reviewRequestId: ID } });
    expect(res.headers.get('location')).toContain('/review-unavailable?reason=not-configured');
  });
});

describe('app URL single source of truth', () => {
  it('reviewUnavailableUrl is built from the request origin', () => {
    expect(reviewUnavailableUrl('https://x.test/api/track/1', 'invalid-link').toString()).toBe(
      'https://x.test/review-unavailable?reason=invalid-link'
    );
  });

  it('getAppUrl never yields a legacy or localhost default', () => {
    const saved = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getAppUrl()).not.toMatch(/localhost|review[\s_-]?flow/i);
    if (saved !== undefined) process.env.NEXT_PUBLIC_APP_URL = saved;
  });
});
