import { randomBytes } from 'crypto';
import { FakeAdmin } from './helpers/fake-admin';

const mockReply = jest.fn();
const mockRefresh = jest.fn();
let admin: FakeAdmin;

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/business', () => ({ requireBusiness: jest.fn(async () => ({ id: 'biz-1' })) }));
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
jest.mock('../google-business', () => {
  const actual = jest.requireActual('../google-business');
  return { ...actual, replyToReview: (...a: unknown[]) => mockReply(...a), refreshAccessToken: (...a: unknown[]) => mockRefresh(...a) };
});

import { GoogleApiError } from '../google-business';
import { encryptToken } from '../google-token-crypto';
import { replyToGoogleReview } from '@/app/(app)/reviews/actions';

beforeAll(() => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  admin = new FakeAdmin();
  admin.rows('google_reviews').push(
    { id: 'rev-1', business_id: 'biz-1', google_review_id: 'g1', reply_text: null, reply_update_time: null },
    { id: 'rev-other', business_id: 'biz-2', google_review_id: 'g2', reply_text: null, reply_update_time: null }
  );
  admin.rows('google_business_connections').push({
    id: 'c1',
    business_id: 'biz-1',
    google_account_id: '111',
    google_location_id: '222',
    status: 'active',
    access_token: encryptToken('access'),
    refresh_token: encryptToken('refresh'),
    token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
});

describe('replyToGoogleReview', () => {
  it('publishes to Google first, then stores the reply', async () => {
    mockReply.mockResolvedValueOnce({ comment: 'Thanks so much!', updateTime: '2026-10-11T10:00:00Z' });

    const res = await replyToGoogleReview('rev-1', '  Thanks so much!  ');

    expect(mockReply).toHaveBeenCalledWith('access', '111', '222', 'g1', 'Thanks so much!');
    expect(res).toMatchObject({ ok: true, replyText: 'Thanks so much!' });
    expect(admin.rows('google_reviews')[0]).toMatchObject({ reply_text: 'Thanks so much!', reply_update_time: '2026-10-11T10:00:00Z' });
  });

  it('does not store anything when Google rejects the reply', async () => {
    mockReply.mockRejectedValueOnce(new GoogleApiError('Review not found', 404));

    const res = await replyToGoogleReview('rev-1', 'Hello');

    expect(res.ok).toBe(false);
    expect(res.message).toContain('Review not found');
    expect(admin.rows('google_reviews')[0].reply_text).toBeNull();
  });

  it('rejects empty and over-long replies without calling Google', async () => {
    expect((await replyToGoogleReview('rev-1', '   ')).ok).toBe(false);
    expect((await replyToGoogleReview('rev-1', 'x'.repeat(4097))).ok).toBe(false);
    expect(mockReply).not.toHaveBeenCalled();
  });

  it("will not reply to another business's review", async () => {
    const res = await replyToGoogleReview('rev-other', 'Hi');
    expect(res).toMatchObject({ ok: false, message: 'Review not found.' });
    expect(mockReply).not.toHaveBeenCalled();
  });

  it('asks the user to reconnect when there is no active connection', async () => {
    admin.rows('google_business_connections')[0].status = 'needs_reconnect';
    const res = await replyToGoogleReview('rev-1', 'Hi');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not connected|Reconnect/i);
    expect(mockReply).not.toHaveBeenCalled();
  });
});
