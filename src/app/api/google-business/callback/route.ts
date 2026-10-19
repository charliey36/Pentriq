import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireBusiness } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/db-errors';
import {
  exchangeCodeForTokens,
  getGoogleConfig,
  GoogleApiError,
  GOOGLE_SCOPE,
  hasBusinessScope,
  listAccounts,
} from '@/lib/google-business';
import { logGoogleOAuth } from '@/lib/google-oauth-log';
import { decryptToken, encryptToken } from '@/lib/google-token-crypto';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'gbp_oauth_state';

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Maps a failure from the token endpoint to a reason code the Integrations page can explain. */
function exchangeReason(err: unknown): string {
  if (!(err instanceof GoogleApiError)) return 'exchange_failed';
  if (err.code === 'invalid_client') return 'invalid_client';
  if (err.code === 'redirect_uri_mismatch') return 'redirect_uri_mismatch';
  if (err.code === 'invalid_grant') return 'code_expired'; // code reused/expired, or redirect_uri differs from the authorize step
  return 'exchange_failed';
}

/** Maps a failure from the first Business Profile API call to a reason code. */
function apiReason(err: unknown): string {
  if (!(err instanceof GoogleApiError)) return 'exchange_failed';
  switch (err.kind) {
    case 'api_not_enabled':
      return 'api_not_enabled';
    case 'quota_or_not_approved':
      return 'api_not_approved';
    case 'scope_insufficient':
      return 'scope_missing';
    case 'permission_denied':
      return 'api_access';
    default:
      return 'exchange_failed';
  }
}

/**
 * Step 2: Google redirects here with `code` + `state`. We verify the state
 * against the cookie set in step 1, exchange the code for tokens, confirm the
 * Business Profile scope was really granted, encrypt and store the tokens
 * (server-side only), then send the user back to Settings → Integrations to
 * choose a location. Tokens never reach the browser. Every failure path logs a
 * structured, secret-free `[google-oauth]` line explaining why.
 */
export async function GET(request: NextRequest) {
  const business = await requireBusiness();
  const params = request.nextUrl.searchParams;
  const redirectUri = getGoogleConfig()?.redirectUri;

  const done = (query: string) => {
    const response = NextResponse.redirect(new URL(`/settings/integrations?${query}`, request.url));
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/google-business' });
    return response;
  };

  const state = params.get('state');
  const code = params.get('code');
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  const googleError = params.get('error');

  logGoogleOAuth('info', 'callback_received', {
    businessId: business.id,
    host: request.nextUrl.host,
    redirectUri,
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasStateCookie: Boolean(expected),
    googleError,
  });

  if (googleError) {
    logGoogleOAuth(googleError === 'access_denied' ? 'warn' : 'error', 'callback_google_error', {
      googleError,
      googleErrorDescription: params.get('error_description'),
      googleErrorSubtype: params.get('error_subtype'),
    });
    return done(`google=error&reason=${googleError === 'access_denied' ? 'denied' : 'google_error'}`);
  }

  if (!code || !state || !expected || !safeEqual(state, expected)) {
    logGoogleOAuth('error', 'state_check_failed', {
      problem: !code ? 'missing_code' : !state ? 'missing_state' : !expected ? 'state_cookie_missing' : 'state_mismatch',
      // A missing cookie almost always means the callback host differs from the host that started the flow
      // (e.g. NEXT_PUBLIC_APP_URL points at production while you are on localhost), or the 10-minute window expired.
      callbackHost: request.nextUrl.host,
      redirectUri,
    });
    return done('google=error&reason=invalid_state');
  }

  try {
    let tokens;
    try {
      tokens = await exchangeCodeForTokens(code);
    } catch (err) {
      logGoogleOAuth('error', 'token_exchange_failed', {
        status: err instanceof GoogleApiError ? err.status : undefined,
        oauthError: err instanceof GoogleApiError ? err.code : undefined,
        message: err instanceof Error ? err.message : String(err),
        redirectUri,
      });
      return done(`google=error&reason=${exchangeReason(err)}`);
    }

    const grantedScopes = tokens.scope ?? '';
    logGoogleOAuth('info', 'token_exchange_ok', {
      hasRefreshToken: Boolean(tokens.refreshToken),
      hasAccessToken: true,
      expiresAt: tokens.expiresAt.toISOString(),
      grantedScopes,
      businessScopeGranted: hasBusinessScope(grantedScopes),
    });

    // Granular consent lets users untick individual permissions: refuse to store a token that can't do the job.
    if (!hasBusinessScope(grantedScopes)) {
      logGoogleOAuth('error', 'scope_missing', { required: GOOGLE_SCOPE, grantedScopes });
      return done('google=error&reason=scope_missing');
    }

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('google_business_connections')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();

    // Google only returns a refresh token on consent; fall back to the stored one on a reconnect.
    let refreshToken = tokens.refreshToken ?? null;
    if (!refreshToken && existing) {
      try {
        refreshToken = decryptToken(existing.refresh_token);
      } catch (err) {
        logGoogleOAuth('error', 'connection_save_failed', {
          problem: 'cannot_decrypt_existing_refresh_token (was GOOGLE_TOKEN_ENCRYPTION_KEY changed?)',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!refreshToken) {
      logGoogleOAuth('error', 'connection_save_failed', { problem: 'no_refresh_token_returned_and_none_stored' });
      return done('google=error&reason=no_refresh_token');
    }

    let accounts;
    try {
      accounts = await listAccounts(tokens.accessToken);
    } catch (err) {
      logGoogleOAuth('error', 'accounts_list_failed', {
        status: err instanceof GoogleApiError ? err.status : undefined,
        kind: err instanceof GoogleApiError ? err.kind : undefined,
        reason: err instanceof GoogleApiError ? err.reason : undefined,
        activationUrl: err instanceof GoogleApiError ? err.activationUrl : undefined,
        message: err instanceof Error ? err.message : String(err),
      });
      return done(`google=error&reason=${apiReason(err)}`);
    }
    if (accounts.length === 0) {
      logGoogleOAuth('warn', 'accounts_empty', { hint: 'This Google login manages no Business Profile accounts.' });
      return done('google=error&reason=no_accounts');
    }

    const keepLocation = Boolean(existing?.google_location_id);
    const selectedAccount = accounts.find((a) => a.accountId === (keepLocation ? existing!.google_account_id : accounts[0].accountId)) ?? accounts[0];
    const row = {
      business_id: business.id,
      google_account_id: keepLocation ? existing!.google_account_id : selectedAccount.accountId,
      google_account_name: keepLocation ? (selectedAccount.accountName ?? existing!.google_account_name ?? null) : selectedAccount.accountName,
      google_location_id: keepLocation ? existing!.google_location_id : null,
      location_name: keepLocation ? existing!.location_name : null,
      access_token: encryptToken(tokens.accessToken),
      refresh_token: encryptToken(refreshToken),
      token_expires_at: tokens.expiresAt.toISOString(),
      status: keepLocation ? ('active' as const) : ('pending_location' as const),
      last_sync_error: null,
      connected_at: new Date().toISOString(),
    };

    let { error } = await admin
      .from('google_business_connections')
      .upsert({ ...row, granted_scopes: grantedScopes }, { onConflict: 'business_id' });
    if (error && isMissingColumnError(error)) {
      // Migration 0020 (granted_scopes) not applied yet: save without it rather than fail the connection.
      logGoogleOAuth('warn', 'connection_save_failed', { problem: 'granted_scopes column missing; apply migration 0020', message: error.message });
      ({ error } = await admin.from('google_business_connections').upsert(row, { onConflict: 'business_id' }));
    }
    if (error) throw new Error(error.message);

    logGoogleOAuth('info', 'connection_saved', {
      businessId: business.id,
      accounts: accounts.length,
      keptLocation: keepLocation,
      status: row.status,
    });
    return done(keepLocation ? 'google=reconnected' : 'google=select');
  } catch (err) {
    logGoogleOAuth('error', 'connection_save_failed', { message: err instanceof Error ? err.message : String(err) });
    return done('google=error&reason=exchange_failed');
  }
}
