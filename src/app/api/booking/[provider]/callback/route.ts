import { NextResponse, type NextRequest } from 'next/server';
import { requireBusiness } from '@/lib/business';
import { getAppUrl } from '@/lib/brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptToken } from '@/lib/google-token-crypto';
import { PROVIDERS, isProviderId } from '@/lib/booking-sync/registry';
import { syncBookingConnection } from '@/lib/booking-sync/sync';
import { captureError } from '@/lib/monitoring';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATE_COOKIE = 'booking_oauth_state';

function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Step 2: the provider sends the owner back with a code. Verify the CSRF state, exchange the code,
 * store the tokens ENCRYPTED, and run the first sync straight away so the owner sees customers
 * and scheduled review requests in the same session.
 */
export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const business = await requireBusiness();
  const done = (query: string) => {
    const res = NextResponse.redirect(new URL(`/settings/integrations?${query}`, request.url));
    res.cookies.set(STATE_COOKIE, '', { path: '/api/booking', maxAge: 0 });
    return res;
  };

  if (!isProviderId(params.provider)) return done('booking=error&reason=unknown_provider');
  const provider = PROVIDERS[params.provider];
  const sp = request.nextUrl.searchParams;

  if (sp.get('error')) return done('booking=error&reason=denied');
  if (!sameState(request.cookies.get(STATE_COOKIE)?.value, sp.get('state'))) return done('booking=error&reason=invalid_state');
  const code = sp.get('code');
  if (!code) return done('booking=error&reason=denied');

  try {
    const tokens = await provider.exchangeCode(code, `${getAppUrl()}/api/booking/${provider.id}/callback`);
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: conn, error } = await admin
      .from('booking_connections')
      .upsert(
        {
          business_id: business.id,
          provider: provider.id,
          status: 'active',
          access_token_enc: encryptToken(tokens.accessToken),
          refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
          token_expires_at: tokens.expiresAt ?? null,
          account_label: tokens.accountLabel ?? provider.label,
          consent_confirmed_at: now,
          last_synced_at: null,
          last_sync_status: null,
          last_sync_message: null,
          updated_at: now,
        },
        { onConflict: 'business_id,provider' }
      )
      .select('*')
      .single();
    if (error || !conn) throw new Error(error?.message ?? 'Could not save the connection.');

    await syncBookingConnection(admin, conn);
    return done(`booking=connected&provider=${provider.id}`);
  } catch (e) {
    captureError(e, { area: 'booking:oauth-callback', tags: { provider: provider.id, business_id: business.id } });
    return done('booking=error&reason=exchange_failed');
  }
}
