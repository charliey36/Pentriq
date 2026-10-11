import { randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireBusiness } from '@/lib/business';
import { buildAuthUrl, getGoogleConfig, GOOGLE_SCOPE } from '@/lib/google-business';
import { logGoogleOAuth } from '@/lib/google-oauth-log';
import { isTokenEncryptionConfigured } from '@/lib/google-token-crypto';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'gbp_oauth_state';

/**
 * Step 1 of the Google Business Profile OAuth flow. Requires a signed-in user
 * (middleware + requireBusiness), stores a random CSRF `state` in a short-lived
 * httpOnly cookie, and sends the browser to Google's consent screen.
 */
export async function GET(request: NextRequest) {
  const business = await requireBusiness();

  const back = (reason: string) =>
    NextResponse.redirect(new URL(`/settings/integrations?google=error&reason=${reason}`, request.url));

  const config = getGoogleConfig();
  if (!config) {
    logGoogleOAuth('error', 'authorize_blocked', { reason: 'not_configured', hasClientId: false, hasClientSecret: false });
    return back('not_configured');
  }
  if (!isTokenEncryptionConfigured()) {
    logGoogleOAuth('error', 'authorize_blocked', { reason: 'encryption_not_configured' });
    return back('encryption_not_configured');
  }

  // The state cookie is set on THIS origin, so Google must send the user back to it.
  // If NEXT_PUBLIC_APP_URL / GOOGLE_REDIRECT_URI point elsewhere (classic local-dev trap: prod URL in
  // .env.local), the callback lands on another host without the cookie and fails with invalid_state.
  const redirectOrigin = new URL(config.redirectUri).origin;
  const requestOrigin = request.nextUrl.origin;
  const originDiffers = redirectOrigin !== requestOrigin;
  if (originDiffers) {
    logGoogleOAuth(process.env.NODE_ENV === 'production' ? 'warn' : 'error', 'authorize_blocked', {
      reason: 'redirect_origin_mismatch',
      redirectUri: config.redirectUri,
      requestOrigin,
      hint: 'Set GOOGLE_REDIRECT_URI (or NEXT_PUBLIC_APP_URL) to this origin and register it in Google Cloud Console.',
    });
    // In development a different origin is always a misconfiguration; in production proxies can legitimately differ.
    if (process.env.NODE_ENV !== 'production') return back('redirect_origin_mismatch');
  }

  const state = randomBytes(24).toString('base64url');
  const url = buildAuthUrl(state);
  logGoogleOAuth('info', 'authorize_start', {
    businessId: business.id,
    redirectUri: config.redirectUri,
    scope: GOOGLE_SCOPE,
    accessType: new URL(url).searchParams.get('access_type'),
    prompt: new URL(url).searchParams.get('prompt'),
    clientIdPrefix: config.clientId.split('-')[0],
  });

  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/google-business',
    maxAge: 60 * 10,
  });
  return response;
}
