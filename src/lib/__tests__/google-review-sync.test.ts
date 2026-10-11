import { randomBytes } from 'crypto';
import { FakeAdmin, type Row } from './helpers/fake-admin';

// --- module mocks ---------------------------------------------------------------

const mockListReviewsPage = jest.fn();
const mockRefresh = jest.fn();
const mockSendAlertEmail = jest.fn();

jest.mock('../google-business', () => {
  const actual = jest.requireActual('../google-business');
  return { ...actual, listReviewsPage: (...a: unknown[]) => mockListReviewsPage(...a), refreshAccessToken: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock('../email', () => ({ sendReviewAlertEmail: (...a: unknown[]) => mockSendAlertEmail(...a) }));
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }));

import { GoogleApiError } from '../google-business';
import { encryptToken } from '../google-token-crypto';
import { syncConnection } from '../google-review-sync';

// --- helpers --------------------------------------------------------------------

const NOW = new Date('2026-10-11T10:00:00Z');
const BUSINESS = 'biz-1';

const raw = (id: string, stars: string, createTime: string, extra: Row = {}) => ({
  reviewId: id,
  reviewer: { displayName: `Person ${id}` },
  starRating: stars,
  comment: `Comment ${id}`,
  createTime,
  updateTime: createTime,
  ...extra,
});

function setup(connOverrides: Row = {}) {
  const db = new FakeAdmin();
  db.rows('businesses').push({ id: BUSINESS, owner_id: 'u1', name: 'Test Salon' });
  const conn = {
    id: 'conn-1',
    business_id: BUSINESS,
    google_account_id: '111',
    google_location_id: '222',
    location_name: 'Test Salon',
    access_token: encryptToken('access-token'),
    refresh_token: encryptToken('refresh-token'),
    token_expires_at: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
    status: 'active',
    rating_alert_threshold: 4.0,
    initial_sync_done: false,
    last_sync_error: null,
    connected_at: '2026-10-01T00:00:00Z',
    last_sync_at: null,
    ...connOverrides,
  };
  db.rows('google_business_connections').push(conn);
  return { db, conn };
}

beforeAll(() => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

// --- tests ----------------------------------------------------------------------

describe('syncConnection: initial import', () => {
  it('imports every page, backfills daily snapshots, and raises no alerts', async () => {
    const { db, conn } = setup();
    mockListReviewsPage
      .mockResolvedValueOnce({
        reviews: [raw('r1', 'FIVE', '2026-10-09T09:00:00Z'), raw('r2', 'ONE', '2026-10-08T09:00:00Z')],
        nextPageToken: 'p2',
        averageRating: 3.5,
        totalReviewCount: 3,
      })
      .mockResolvedValueOnce({
        reviews: [raw('r3', 'FOUR', '2026-09-20T09:00:00Z')],
        nextPageToken: null,
        averageRating: 3.5,
        totalReviewCount: 3,
      });

    const result = await syncConnection(db as any, conn as any, NOW);

    expect(result).toMatchObject({ ok: true, initial: true, fetched: 3, inserted: 3, updated: 0, alerts: 0 });
    expect(mockListReviewsPage).toHaveBeenCalledTimes(2);
    expect(db.rows('google_reviews')).toHaveLength(3);
    expect(db.rows('google_reviews').find((r) => r.google_review_id === 'r2')).toMatchObject({
      business_id: BUSINESS,
      rating: 1,
      reviewer_name: 'Person r2',
    });

    // Snapshots: one per review day plus today, with Google's aggregate for today.
    const snaps = db.rows('review_metrics_daily');
    expect(snaps.map((s) => s.date)).toEqual(['2026-09-20', '2026-10-08', '2026-10-09', '2026-10-11']);
    expect(snaps[snaps.length - 1]).toMatchObject({ total_reviews: 3, average_rating: 3.5, reviews_gained_today: 0 });

    expect(db.rows('review_alerts')).toHaveLength(0);
    expect(db.rows('google_business_connections')[0]).toMatchObject({
      initial_sync_done: true,
      last_sync_error: null,
      status: 'active',
      last_sync_at: NOW.toISOString(),
    });
  });

  it('prunes local reviews that no longer exist on Google after a complete import', async () => {
    const { db, conn } = setup();
    db.rows('google_reviews').push({ id: 'old', business_id: BUSINESS, google_review_id: 'deleted-on-google', rating: 2, review_date: '2026-01-01T00:00:00Z' });
    mockListReviewsPage.mockResolvedValueOnce({ reviews: [raw('r1', 'FIVE', '2026-10-09T09:00:00Z')], nextPageToken: null, averageRating: 5, totalReviewCount: 1 });

    await syncConnection(db as any, conn as any, NOW);
    expect(db.rows('google_reviews').map((r) => r.google_review_id)).toEqual(['r1']);
  });
});

describe('syncConnection: incremental sync', () => {
  const synced = { initial_sync_done: true, last_sync_at: '2026-10-11T04:00:00Z' };

  function seedExisting(db: FakeAdmin) {
    db.rows('google_reviews').push(
      { id: 'a', business_id: BUSINESS, google_review_id: 'r1', rating: 5, review_date: '2026-10-09T09:00:00Z', update_time: '2026-10-09T09:00:00.000Z', reply_text: null },
      { id: 'b', business_id: BUSINESS, google_review_id: 'r2', rating: 4, review_date: '2026-09-09T09:00:00Z', update_time: '2026-09-09T09:00:00.000Z', reply_text: null }
    );
    db.rows('review_metrics_daily').push({
      business_id: BUSINESS,
      date: '2026-10-10',
      total_reviews: 2,
      average_rating: 4.5,
      reviews_gained_today: 0,
    });
  }

  it('inserts new reviews, updates modified ones and syncs replies from Google', async () => {
    const { db, conn } = setup(synced);
    seedExisting(db);
    mockListReviewsPage.mockResolvedValueOnce({
      reviews: [
        raw('r3', 'FIVE', '2026-10-11T08:00:00Z'), // new
        raw('r1', 'FIVE', '2026-10-09T09:00:00Z', {
          updateTime: '2026-10-11T07:00:00Z',
          reviewReply: { comment: 'Thanks!', updateTime: '2026-10-11T07:00:00Z' },
        }), // reply added on Google
      ],
      nextPageToken: null,
      averageRating: 4.67,
      totalReviewCount: 3,
    });

    const result = await syncConnection(db as any, { ...conn } as any, NOW);

    expect(result).toMatchObject({ ok: true, initial: false, inserted: 1, updated: 1 });
    const reviews = db.rows('google_reviews');
    expect(reviews).toHaveLength(3);
    expect(reviews.find((r) => r.google_review_id === 'r1')).toMatchObject({ reply_text: 'Thanks!' });

    // Only today's snapshot is written on incremental runs.
    const today = db.rows('review_metrics_daily').find((s) => s.date === '2026-10-11');
    expect(today).toMatchObject({ total_reviews: 3, average_rating: 4.67, reviews_gained_today: 1 });

    // New (non-initial) review => in-app alert, no email for routine reviews.
    expect(db.rows('review_alerts').map((a) => a.type)).toEqual(['new_review']);
    expect(mockSendAlertEmail).not.toHaveBeenCalled();
  });

  it('stops paging once a whole page predates the last sync', async () => {
    const { db, conn } = setup(synced);
    seedExisting(db);
    mockListReviewsPage.mockResolvedValueOnce({
      reviews: [raw('r2', 'FOUR', '2026-09-09T09:00:00Z')],
      nextPageToken: 'more',
      averageRating: 4.5,
      totalReviewCount: 2,
    });
    const result = await syncConnection(db as any, conn as any, NOW);
    expect(mockListReviewsPage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, inserted: 0, updated: 0 });
  });

  it('emails the owner for a new 1-star review and is idempotent when re-run', async () => {
    const { db, conn } = setup(synced);
    seedExisting(db);
    const page = {
      reviews: [raw('r9', 'ONE', '2026-10-11T08:30:00Z')],
      nextPageToken: null,
      averageRating: 3.9,
      totalReviewCount: 3,
    };
    mockListReviewsPage.mockResolvedValue(page);

    await syncConnection(db as any, conn as any, NOW);
    const types = db.rows('review_alerts').map((a) => a.type).sort();
    // 1-star + new review + average fell from 4.5 (yesterday) to 3.9 (below the 4.0 threshold).
    expect(types).toEqual(['low_rating', 'new_one_star', 'new_review']);
    expect(mockSendAlertEmail).toHaveBeenCalledTimes(2); // 1-star + low rating; routine new reviews are in-app only
    expect(mockSendAlertEmail.mock.calls[0][0]).toBe('owner@example.com');

    // Running the same sync again must not duplicate alerts or emails.
    const alertCount = db.rows('review_alerts').length;
    const emailCount = mockSendAlertEmail.mock.calls.length;
    await syncConnection(db as any, db.rows('google_business_connections')[0] as any, NOW);
    expect(db.rows('review_alerts')).toHaveLength(alertCount);
    expect(mockSendAlertEmail).toHaveBeenCalledTimes(emailCount);
    expect(db.rows('google_reviews').filter((r) => r.google_review_id === 'r9')).toHaveLength(1);
  });
});

describe('syncConnection: tokens and failures', () => {
  it('refreshes an expired access token and stores the new one encrypted', async () => {
    const { db, conn } = setup({ token_expires_at: new Date(NOW.getTime() - 60_000).toISOString() });
    mockRefresh.mockResolvedValueOnce({ accessToken: 'fresh-access', expiresAt: new Date(Date.now() + 3_600_000) });
    mockListReviewsPage.mockResolvedValueOnce({ reviews: [], nextPageToken: null, averageRating: null, totalReviewCount: 0 });

    const result = await syncConnection(db as any, conn as any, NOW);

    expect(result.ok).toBe(true);
    expect(mockRefresh).toHaveBeenCalledWith('refresh-token');
    expect(mockListReviewsPage.mock.calls[0][0]).toBe('fresh-access');
    const stored = db.rows('google_business_connections')[0].access_token as string;
    expect(stored).not.toContain('fresh-access');
    expect(stored.startsWith('v1:')).toBe(true);
  });

  it('marks the connection needs_reconnect when Google revokes the refresh token', async () => {
    const { db, conn } = setup({ token_expires_at: new Date(NOW.getTime() - 60_000).toISOString() });
    mockRefresh.mockRejectedValueOnce(new GoogleApiError('Token has been expired or revoked.', 400, 'invalid_grant'));

    const result = await syncConnection(db as any, conn as any, NOW);

    expect(result.ok).toBe(false);
    expect(db.rows('google_business_connections')[0]).toMatchObject({ status: 'needs_reconnect' });
    expect(mockListReviewsPage).not.toHaveBeenCalled();
  });

  it('records API failures on the connection without throwing', async () => {
    const { db, conn } = setup();
    mockListReviewsPage.mockRejectedValueOnce(new GoogleApiError('Quota exceeded', 429));

    const result = await syncConnection(db as any, conn as any, NOW);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/429.*not been approved|quota is 0/i);
    expect(db.rows('google_business_connections')[0]).toMatchObject({ initial_sync_done: false });
    expect(db.rows('google_business_connections')[0].last_sync_error).toMatch(/approved/i);
  });

  it('skips connections that still need a location or re-authorisation', async () => {
    const noLocation = setup({ google_location_id: null, status: 'pending_location' });
    expect((await syncConnection(noLocation.db as any, noLocation.conn as any, NOW)).ok).toBe(false);
    const reconnect = setup({ status: 'needs_reconnect' });
    expect((await syncConnection(reconnect.db as any, reconnect.conn as any, NOW)).ok).toBe(false);
    expect(mockListReviewsPage).not.toHaveBeenCalled();
  });
});
