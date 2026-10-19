import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { FakeAdmin } from './helpers/fake-admin';

let admin: FakeAdmin;
let logs: string[] = [];
const mockExchange = jest.fn();
const mockListAccounts = jest.fn();

jest.mock('@/lib/business', () => ({ requireBusiness: jest.fn(async () => ({ id: 'biz-1' })) }));
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
jest.mock('../google-business', () => {
  const actual = jest.requireActual('../google-business');
  return { ...actual, exchangeCodeForTokens: (...a: unknown[]) => mockExchange(...a), listAccounts: (...a: unknown[]) => mockListAccounts(...a) };
});

import { GET } from '@/app/api/google-business/callback/route';
import { GoogleApiError, GOOGLE_SCOPE } from '../google-business';
import { decryptToken } from '../google-token-crypto';

const call = (query: string, cookie?: string) =>
  GET(
    new NextRequest(`https://app.example.com/api/google-business/callback?${query}`, {
      headers: cookie ? { cookie: `gbp_oauth_state=${cookie}` } : {},
    })
  );
const location = (res: Response) => new URL(res.headers.get('location')!).search;

beforeAll(() => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});
beforeEach(() => {
  jest.clearAllMocks();
  logs = [];
  for (const m of ['log', 'warn', 'error'] as const) jest.spyOn(console, m).mockImplementation((...args: unknown[]) => void logs.push(String(args[0])));
  admin = new FakeAdmin();
  mockExchange.mockResolvedValue({ accessToken: 'plain-access', refreshToken: 'plain-refresh', expiresAt: new Date('2026-10-11T11:00:00Z'), scope: `openid ${GOOGLE_SCOPE}` });
  mockListAccounts.mockResolvedValue([{ accountId: '111', accountName: 'Salon' }]);
});

describe('GET /api/google-business/callback', () => {
  it('rejects a missing or mismatched CSRF state without touching Google or the database', async () => {
    expect(location(await call('code=abc&state=x'))).toContain('reason=invalid_state'); // no cookie
    expect(location(await call('code=abc&state=x', 'y'))).toContain('reason=invalid_state'); // mismatch
    expect(mockExchange).not.toHaveBeenCalled();
    expect(admin.rows('google_business_connections')).toHaveLength(0);
  });

  it('reports a declined consent screen', async () => {
    expect(location(await call('error=access_denied'))).toContain('reason=denied');
  });

  it('stores encrypted tokens and sends the user to pick a location', async () => {
    const res = await call('code=abc&state=nonce', 'nonce');

    expect(location(res)).toBe('?google=select');
    const [row] = admin.rows('google_business_connections');
    expect(row).toMatchObject({ business_id: 'biz-1', google_account_id: '111', google_account_name: 'Salon', google_location_id: null, status: 'pending_location' });
    // Tokens are encrypted at rest, never plaintext.
    expect(row.access_token).not.toContain('plain-access');
    expect(row.refresh_token).not.toContain('plain-refresh');
    expect(decryptToken(row.access_token)).toBe('plain-access');
    expect(decryptToken(row.refresh_token)).toBe('plain-refresh');
  });

  it('keeps the chosen location when an existing connection is re-authorised', async () => {
    const first = await call('code=abc&state=nonce', 'nonce');
    expect(first.status).toBe(307);
    Object.assign(admin.rows('google_business_connections')[0], { google_location_id: '222', location_name: 'Main Salon', status: 'needs_reconnect' });
    mockExchange.mockResolvedValueOnce({ accessToken: 'new-access', expiresAt: new Date('2026-10-11T12:00:00Z'), scope: GOOGLE_SCOPE }); // no refresh token this time

    const res = await call('code=def&state=nonce', 'nonce');

    expect(location(res)).toBe('?google=reconnected');
    const [row] = admin.rows('google_business_connections');
    expect(row).toMatchObject({ google_location_id: '222', location_name: 'Main Salon', status: 'active' });
    expect(decryptToken(row.refresh_token)).toBe('plain-refresh'); // reused
    expect(decryptToken(row.access_token)).toBe('new-access');
  });

  it('fails cleanly when the Google account has no Business Profile accounts', async () => {
    mockListAccounts.mockResolvedValueOnce([]);
    expect(location(await call('code=abc&state=nonce', 'nonce'))).toContain('reason=no_accounts');
    expect(admin.rows('google_business_connections')).toHaveLength(0);
  });

  it('stores the granted scopes alongside the connection', async () => {
    await call('code=abc&state=nonce', 'nonce');
    expect(admin.rows('google_business_connections')[0].granted_scopes).toContain(GOOGLE_SCOPE);
  });

  it('refuses to store a token when the user unticked the Business Profile permission', async () => {
    mockExchange.mockResolvedValueOnce({ accessToken: 'a', refreshToken: 'r', expiresAt: new Date(), scope: 'openid email' });
    const res = await call('code=abc&state=nonce', 'nonce');
    expect(location(res)).toContain('reason=scope_missing');
    expect(admin.rows('google_business_connections')).toHaveLength(0);
    expect(logs.join('\n')).toContain('"event":"scope_missing"');
  });

  it.each([
    [new GoogleApiError('Unauthorized', 401, 'invalid_client'), 'invalid_client'],
    [new GoogleApiError('Bad Request', 400, 'invalid_grant'), 'code_expired'],
    [new GoogleApiError('Bad Request', 400, 'redirect_uri_mismatch'), 'redirect_uri_mismatch'],
  ])('maps token-exchange failure %#', async (err, reason) => {
    mockExchange.mockRejectedValueOnce(err);
    expect(location(await call('code=abc&state=nonce', 'nonce'))).toContain(`reason=${reason}`);
    expect(admin.rows('google_business_connections')).toHaveLength(0);
  });

  it.each([
    [new GoogleApiError('API disabled', 403, undefined, 'SERVICE_DISABLED', 'https://console.example/enable'), 'api_not_enabled'],
    [new GoogleApiError('Quota exceeded', 429), 'api_not_approved'],
    [new GoogleApiError('Forbidden', 403), 'api_access'],
  ])('maps Business Profile API failure %#', async (err, reason) => {
    mockListAccounts.mockRejectedValueOnce(err);
    expect(location(await call('code=abc&state=nonce', 'nonce'))).toContain(`reason=${reason}`);
    expect(admin.rows('google_business_connections')).toHaveLength(0);
  });

  it('logs why a state check failed, and never logs tokens, codes or secrets', async () => {
    await call('code=SECRET-AUTH-CODE&state=x'); // no cookie
    await call('code=SECRET-AUTH-CODE&state=nonce', 'nonce'); // success path
    const output = logs.join('\n');
    expect(output).toContain('"problem":"state_cookie_missing"');
    expect(output).toContain('"event":"connection_saved"');
    for (const secret of ['SECRET-AUTH-CODE', 'plain-access', 'plain-refresh']) expect(output).not.toContain(secret);
  });
});
