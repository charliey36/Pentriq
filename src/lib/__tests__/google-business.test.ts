import { buildAuthUrl, getGoogleConfig, GoogleApiError, idFromResource, listLocations, normalizeReview } from '../google-business';

describe('normalizeReview', () => {
  it('maps a Google v4 review resource to our row shape', () => {
    expect(
      normalizeReview({
        reviewId: 'abc123',
        reviewer: { displayName: 'Jane Smith', profilePhotoUrl: 'https://lh3.example/photo.jpg' },
        starRating: 'FOUR',
        comment: '  Lovely service  ',
        createTime: '2026-10-01T10:00:00Z',
        updateTime: '2026-10-02T11:00:00Z',
        reviewReply: { comment: 'Thank you!', updateTime: '2026-10-02T12:00:00Z' },
      })
    ).toEqual({
      google_review_id: 'abc123',
      reviewer_name: 'Jane Smith',
      reviewer_photo_url: 'https://lh3.example/photo.jpg',
      rating: 4,
      comment: 'Lovely service',
      review_date: '2026-10-01T10:00:00.000Z',
      update_time: '2026-10-02T11:00:00.000Z',
      reply_text: 'Thank you!',
      reply_update_time: '2026-10-02T12:00:00.000Z',
    });
  });

  it('handles anonymous reviewers, rating-only reviews and missing replies', () => {
    const r = normalizeReview({
      name: 'accounts/1/locations/2/reviews/zzz',
      reviewer: { displayName: 'A Google User', isAnonymous: true, profilePhotoUrl: 'x' },
      starRating: 'FIVE',
      createTime: '2026-10-01T10:00:00Z',
    });
    expect(r).toMatchObject({
      google_review_id: 'zzz',
      reviewer_name: 'Anonymous',
      reviewer_photo_url: null,
      rating: 5,
      comment: null,
      reply_text: null,
      reply_update_time: null,
      update_time: '2026-10-01T10:00:00.000Z',
    });
  });

  it('skips unusable rows (no id, unknown rating, no date)', () => {
    expect(normalizeReview({ starRating: 'FIVE', createTime: '2026-10-01T10:00:00Z' })).toBeNull();
    expect(normalizeReview({ reviewId: 'a', starRating: 'STAR_RATING_UNSPECIFIED', createTime: '2026-10-01T10:00:00Z' })).toBeNull();
    expect(normalizeReview({ reviewId: 'a', starRating: 'FIVE' })).toBeNull();
  });
});

describe('location review URL', () => {
  it('returns Google metadata.newReviewUri for a selectable location', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          locations: [
            {
              name: 'accounts/123/locations/456',
              title: 'Acme Coffee',
              storefrontAddress: { addressLines: ['1 High Street'], locality: 'London', postalCode: 'SW1A 1AA' },
              metadata: { newReviewUri: 'https://g.page/r/acme/review' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(listLocations('access-token', '123', 'Acme Account')).resolves.toEqual([
      {
        accountId: '123',
        accountName: 'Acme Account',
        locationId: '456',
        title: 'Acme Coffee',
        address: '1 High Street, London, SW1A 1AA',
        reviewUrl: 'https://g.page/r/acme/review',
      },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain('readMask=name%2Ctitle%2CstorefrontAddress%2Cmetadata.newReviewUri');
    fetchMock.mockRestore();
  });
});

describe('oauth helpers', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('returns null config until client credentials are set', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(getGoogleConfig()).toBeNull();
    expect(() => buildAuthUrl('s')).toThrow(/not configured/);
  });

  it('builds a consent URL requesting offline access with the state', () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';
    delete process.env.GOOGLE_REDIRECT_URI;

    const url = new URL(buildAuthUrl('state-123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/google-business/callback');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/business.manage');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-123');
    // The client secret must never appear in a browser-facing URL.
    expect(url.toString()).not.toContain('secret');
  });

  it('extracts ids from resource names', () => {
    expect(idFromResource('accounts/123')).toBe('123');
    expect(idFromResource('locations/456')).toBe('456');
    expect(idFromResource('789')).toBe('789');
  });

  it('flags revoked auth errors', () => {
    expect(new GoogleApiError('x', 400, 'invalid_grant').isAuthRevoked).toBe(true);
    expect(new GoogleApiError('x', 401).isAuthRevoked).toBe(true);
    expect(new GoogleApiError('x', 500).isAuthRevoked).toBe(false);
  });
});
