import { NextRequest } from 'next/server';

jest.mock('@/lib/business', () => ({ requireBusiness: jest.fn(async () => ({ id: 'biz-1' })) }));

import { GET } from '@/app/api/google-business/connect/route';
import { GOOGLE_SCOPE } from '../google-business';

const env = { ...process.env };
let logs: string[] = [];

beforeEach(() => {
  process.env = { ...env, GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'GOCSPX-shh', GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') };
  delete process.env.GOOGLE_REDIRECT_URI;
  logs = [];
  for (const m of ['log', 'warn', 'error'] as const) jest.spyOn(console, m).mockImplementation((...args: unknown[]) => void logs.push(String(args[0])));
});
afterAll(() => {
  process.env = env;
});

const call = (origin: string) => GET(new NextRequest(`${origin}/api/google-business/connect`));

describe('GET /api/google-business/connect', () => {
  it('sends the user to Google requesting business.manage, offline access and consent, with a state cookie', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const res = await call('https://app.example.com');
    const url = new URL(res.headers.get('location')!);

    expect(url.host).toBe('accounts.google.com');
    expect(url.searchParams.get('scope')).toBe(GOOGLE_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/google-business/callback');

    const cookie = res.cookies.get('gbp_oauth_state');
    expect(cookie?.value).toBe(url.searchParams.get('state'));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');

    const out = logs.join('\n');
    expect(out).toContain('"event":"authorize_start"');
    expect(out).not.toContain('GOCSPX-shh');
  });

  it('blocks the local-dev trap: redirect URI pointing at another origin than the one being used', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://prod.example.com';
    const res = await call('http://localhost:3000'); // NODE_ENV is "test" (not production)
    expect(new URL(res.headers.get('location')!).search).toContain('reason=redirect_origin_mismatch');
    expect(res.cookies.get('gbp_oauth_state')).toBeUndefined();
    expect(logs.join('\n')).toContain('redirect_origin_mismatch');
  });

  it('reports missing configuration', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await call('http://localhost:3000');
    expect(new URL(res.headers.get('location')!).search).toContain('reason=not_configured');
  });
});
