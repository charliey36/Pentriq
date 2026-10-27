import { randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireBusiness } from '@/lib/business';
import { getAppUrl } from '@/lib/brand';
import { isTokenEncryptionConfigured } from '@/lib/google-token-crypto';
import { PROVIDERS, isProviderId } from '@/lib/booking-sync/registry';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'booking_oauth_state';

/**
 * Step 1 of connecting a booking system: signed-in owners only, and only after they tick the
 * "I may contact my customers" box. Stores a random CSRF state in a short-lived httpOnly cookie
 * and sends the browser to the provider's consent screen.
 */
export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  await requireBusiness();
  const back = (reason: string) => NextResponse.redirect(new URL(`/settings/integrations?booking=error&reason=${reason}`, request.url));

  if (!isProviderId(params.provider)) return back('unknown_provider');
  const provider = PROVIDERS[params.provider];
  if (!provider.isConfigured()) return back('not_configured');
  if (!isTokenEncryptionConfigured()) return back('encryption_not_configured');
  if (request.nextUrl.searchParams.get('consent') !== 'on') return back('consent_required');

  const state = `${provider.id}.${randomBytes(24).toString('base64url')}`;
  const response = NextResponse.redirect(provider.authorizeUrl(state, `${getAppUrl()}/api/booking/${provider.id}/callback`));
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/booking', maxAge: 600 });
  return response;
}
