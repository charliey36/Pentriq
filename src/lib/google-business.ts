import { getAppUrl } from '@/lib/brand';
import { isSafeHttpUrl } from '@/lib/email-templates/review-destinations';

/**
 * Thin, dependency-free client for the Google Business Profile APIs and the
 * Google OAuth 2.0 endpoints. Server-only: it reads GOOGLE_CLIENT_SECRET.
 *
 * APIs used:
 *   - Account Management v1   accounts.list
 *   - Business Information v1 accounts.locations.list
 *   - My Business v4          accounts.locations.reviews.list / updateReply
 *     (reviews are only exposed through the v4 surface)
 *
 * Note: these APIs require access approval for the Google Cloud project
 * (https://developers.google.com/my-business/content/prereqs) and the
 * "Business Profile" APIs enabled. See README → Google Business Profile.
 */

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/business.manage';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const BUSINESS_INFO_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const REVIEWS_URL = 'https://mybusiness.googleapis.com/v4';

/** Plain-English explanation of a Google failure, safe to show in the UI and store as last_sync_error. */
export function describeGoogleError(err: unknown): string {
  if (!(err instanceof GoogleApiError)) return err instanceof Error ? err.message : 'Unknown error';
  switch (err.kind) {
    case 'invalid_client':
      return 'Google rejected the OAuth client ID/secret. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.';
    case 'auth_revoked':
      return 'Google access was revoked or expired. Please reconnect.';
    case 'api_not_enabled':
      return `A Business Profile API is not enabled for this Google Cloud project${err.activationUrl ? ` (enable it at ${err.activationUrl})` : ''}.`;
    case 'scope_insufficient':
      return 'The Google login did not grant Business Profile access (business.manage). Reconnect and tick the permission.';
    case 'quota_or_not_approved':
      return 'Google rejected the request (429). If the Business Profile API quota is 0 QPM, the project has not been approved for API access yet.';
    case 'permission_denied':
      return `Google denied access: ${err.message}`;
    default:
      return err.message;
  }
}

/** What a Google failure means for the user / operator. */
export type GoogleErrorKind =
  | 'invalid_client' // wrong client id / secret
  | 'auth_revoked' // token revoked/expired: reconnect
  | 'api_not_enabled' // API not enabled in Cloud Console
  | 'scope_insufficient' // token lacks business.manage
  | 'quota_or_not_approved' // 429: quota is 0 until Google approves the project
  | 'permission_denied' // other 403 (e.g. Workspace has Business Profile turned off)
  | 'other';

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** OAuth error code such as "invalid_grant" (token endpoint only). */
    readonly code?: string,
    /** Google's machine reason, e.g. "SERVICE_DISABLED" / "accessNotConfigured". */
    readonly reason?: string,
    /** Where to enable a disabled API (from Google's ErrorInfo metadata). */
    readonly activationUrl?: string
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }

  /** The refresh token was revoked/expired: the user must reconnect. */
  get isAuthRevoked() {
    return this.code === 'invalid_grant' || this.status === 401;
  }

  get kind(): GoogleErrorKind {
    if (this.code === 'invalid_client') return 'invalid_client';
    if (this.isAuthRevoked) return 'auth_revoked';
    if (this.reason === 'SERVICE_DISABLED' || this.reason === 'accessNotConfigured') return 'api_not_enabled';
    if (this.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' || this.reason === 'insufficientPermissions') return 'scope_insufficient';
    if (this.status === 429) return 'quota_or_not_approved';
    if (this.status === 403) return 'permission_denied';
    return 'other';
  }
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() || `${getAppUrl()}/api/google-business/callback`,
  };
}

function requireConfig() {
  const config = getGoogleConfig();
  if (!config) throw new Error('Google OAuth is not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).');
  return config;
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    // offline + consent guarantees a refresh token on every (re)connect.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleTokens = {
  accessToken: string;
  /** Absent on refresh responses. */
  refreshToken?: string;
  expiresAt: Date;
  /** Space-separated scopes Google actually granted (authorization-code exchange only). */
  scope?: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new GoogleApiError(json.error_description || json.error || `Token request failed (${res.status})`, res.status, json.error);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
    scope: json.scope,
  };
}

/** True when the granted scope string includes Business Profile access. */
export function hasBusinessScope(scope: string | undefined | null): boolean {
  return (scope ?? '').split(/\s+/).includes(GOOGLE_SCOPE);
}

export function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = requireConfig();
  return postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
}

export function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireConfig();
  return postToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
}

/** Best-effort revoke on disconnect; failures are ignored (token may already be dead). */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      cache: 'no-store',
    });
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------------------
// Authenticated requests
// ---------------------------------------------------------------------------

async function googleFetch<T>(url: string, accessToken: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  // Back off and retry once on rate limiting / transient server errors.
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    return googleFetch<T>(url, accessToken, init, attempt + 1);
  }

  if (!res.ok) {
    let message = `Google API request failed (${res.status})`;
    let reason: string | undefined;
    let activationUrl: string | undefined;
    try {
      const body = (await res.json()) as {
        error?: {
          message?: string;
          errors?: { reason?: string }[];
          details?: { reason?: string; metadata?: { activationUrl?: string } }[];
        };
      };
      if (body.error?.message) message = body.error.message;
      const info = body.error?.details?.find((d) => d.reason);
      reason = info?.reason ?? body.error?.errors?.[0]?.reason;
      activationUrl = info?.metadata?.activationUrl;
    } catch {
      /* non-JSON error body */
    }
    throw new GoogleApiError(message, res.status, undefined, reason, activationUrl);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Accounts & locations
// ---------------------------------------------------------------------------

export type GoogleLocationOption = {
  accountId: string;
  accountName: string;
  locationId: string;
  title: string;
  address: string | null;
  reviewUrl: string | null;
};

/** "accounts/123" -> "123" (also accepts a bare id). */
export function idFromResource(resource: string): string {
  return resource.split('/').pop() ?? resource;
}

export async function listAccounts(accessToken: string): Promise<{ accountId: string; accountName: string }[]> {
  const out: { accountId: string; accountName: string }[] = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ pageSize: '20' });
    if (pageToken) qs.set('pageToken', pageToken);
    const json = await googleFetch<{
      accounts?: { name: string; accountName?: string }[];
      nextPageToken?: string;
    }>(`${ACCOUNTS_URL}?${qs}`, accessToken);
    for (const a of json.accounts ?? []) {
      out.push({ accountId: idFromResource(a.name), accountName: a.accountName ?? a.name });
    }
    pageToken = json.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

type RawLocation = {
  name: string;
  title?: string;
  storefrontAddress?: { addressLines?: string[]; locality?: string; postalCode?: string };
  metadata?: { newReviewUri?: string };
};

function formatAddress(a: RawLocation['storefrontAddress']): string | null {
  if (!a) return null;
  const parts = [a.addressLines?.[0], a.locality, a.postalCode].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export async function listLocations(accessToken: string, accountId: string, accountName = accountId) {
  const out: GoogleLocationOption[] = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ readMask: 'name,title,storefrontAddress,metadata.newReviewUri', pageSize: '100' });
    if (pageToken) qs.set('pageToken', pageToken);
    const json = await googleFetch<{ locations?: RawLocation[]; nextPageToken?: string }>(
      `${BUSINESS_INFO_URL}/accounts/${encodeURIComponent(accountId)}/locations?${qs}`,
      accessToken
    );
    for (const l of json.locations ?? []) {
      out.push({
        accountId,
        accountName,
        locationId: idFromResource(l.name),
        title: l.title ?? 'Untitled location',
        address: formatAddress(l.storefrontAddress),
        reviewUrl: isSafeHttpUrl(l.metadata?.newReviewUri) ? l.metadata!.newReviewUri!.trim() : null,
      });
    }
    pageToken = json.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

/** Every location across every account the user can manage. */
export async function listAllLocations(accessToken: string): Promise<GoogleLocationOption[]> {
  const accounts = await listAccounts(accessToken);
  const perAccount = await Promise.all(accounts.map((a) => listLocations(accessToken, a.accountId, a.accountName)));
  return perAccount.flat();
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

const STAR_RATINGS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export type RawGoogleReview = {
  reviewId?: string;
  name?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

export type NormalizedReview = {
  google_review_id: string;
  reviewer_name: string;
  reviewer_photo_url: string | null;
  rating: number;
  comment: string | null;
  review_date: string;
  update_time: string;
  reply_text: string | null;
  reply_update_time: string | null;
};

/** Maps a v4 review resource to our row shape. Returns null if it can't be used. */
export function normalizeReview(raw: RawGoogleReview): NormalizedReview | null {
  const id = raw.reviewId ?? raw.name?.split('/').pop();
  const rating = raw.starRating ? STAR_RATINGS[raw.starRating] : undefined;
  if (!id || !rating || !raw.createTime) return null;

  const anonymous = raw.reviewer?.isAnonymous || !raw.reviewer?.displayName;
  // Google appends "(Translated by Google)" / "(Original)" blocks to comments; keep the raw text.
  const comment = raw.comment?.trim() || null;

  return {
    google_review_id: id,
    reviewer_name: anonymous ? 'Anonymous' : (raw.reviewer!.displayName as string),
    reviewer_photo_url: anonymous ? null : (raw.reviewer?.profilePhotoUrl ?? null),
    rating,
    comment,
    review_date: new Date(raw.createTime).toISOString(),
    update_time: new Date(raw.updateTime ?? raw.createTime).toISOString(),
    reply_text: raw.reviewReply?.comment?.trim() || null,
    reply_update_time: raw.reviewReply?.updateTime ? new Date(raw.reviewReply.updateTime).toISOString() : null,
  };
}

export type ReviewsPage = {
  reviews: RawGoogleReview[];
  nextPageToken: string | null;
  /** Google's own aggregate for the location (covers reviews we haven't paged through). */
  averageRating: number | null;
  totalReviewCount: number | null;
};

export async function listReviewsPage(
  accessToken: string,
  accountId: string,
  locationId: string,
  pageToken?: string
): Promise<ReviewsPage> {
  const qs = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
  if (pageToken) qs.set('pageToken', pageToken);
  const json = await googleFetch<{
    reviews?: RawGoogleReview[];
    nextPageToken?: string;
    averageRating?: number;
    totalReviewCount?: number;
  }>(`${REVIEWS_URL}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/reviews?${qs}`, accessToken);
  return {
    reviews: json.reviews ?? [],
    nextPageToken: json.nextPageToken ?? null,
    averageRating: typeof json.averageRating === 'number' ? json.averageRating : null,
    totalReviewCount: typeof json.totalReviewCount === 'number' ? json.totalReviewCount : null,
  };
}

/** Creates or replaces the owner's public reply to a review. */
export async function replyToReview(
  accessToken: string,
  accountId: string,
  locationId: string,
  reviewId: string,
  comment: string
): Promise<{ comment: string; updateTime: string }> {
  const json = await googleFetch<{ comment?: string; updateTime?: string }>(
    `${REVIEWS_URL}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/reviews/${encodeURIComponent(reviewId)}/reply`,
    accessToken,
    { method: 'PUT', body: JSON.stringify({ comment }) }
  );
  return { comment: json.comment ?? comment, updateTime: json.updateTime ?? new Date().toISOString() };
}
