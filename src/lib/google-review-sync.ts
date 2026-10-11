import { createAdminClient } from '@/lib/supabase/admin';
import type { GoogleBusinessConnection } from '@/lib/database.types';
import { sendReviewAlertEmail } from '@/lib/email';
import { decryptToken, encryptToken } from '@/lib/google-token-crypto';
import {
  describeGoogleError,
  GoogleApiError,
  listReviewsPage,
  normalizeReview,
  refreshAccessToken,
  type NormalizedReview,
} from '@/lib/google-business';
import {
  addDays,
  buildSnapshotsFromReviews,
  dateKey,
  previousMonthEnd,
  statsAsOf,
  type SnapshotLite,
} from '@/lib/google-review-analytics';
import { buildAlerts, shouldEmail, type AlertDraft } from '@/lib/google-review-alerts';
import { logGoogleOAuth } from '@/lib/google-oauth-log';

type Admin = ReturnType<typeof createAdminClient>;

/** Safety cap: 100 pages x 50 = 5,000 reviews per run. */
const MAX_PAGES = 100;
/** Incremental syncs re-read this much history to catch late edits/replies. */
const INCREMENTAL_OVERLAP_MS = 24 * 3_600_000;
const PAGE_SIZE = 1000;
const CHUNK = 200;

export type SyncResult = {
  businessId: string;
  ok: boolean;
  initial: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  alerts: number;
  error?: string;
};

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * Returns a usable access token, refreshing (and persisting the new,
 * re-encrypted token) when it is within a minute of expiry. A revoked refresh
 * token flips the connection to `needs_reconnect`.
 */
export async function getAccessToken(admin: Admin, conn: GoogleBusinessConnection, now: Date = new Date()): Promise<string> {
  if (conn.token_expires_at && Date.parse(conn.token_expires_at) - now.getTime() > 60_000) {
    return decryptToken(conn.access_token);
  }
  try {
    const refreshed = await refreshAccessToken(decryptToken(conn.refresh_token));
    await admin
      .from('google_business_connections')
      .update({
        access_token: encryptToken(refreshed.accessToken),
        token_expires_at: refreshed.expiresAt.toISOString(),
        // Google occasionally rotates the refresh token.
        ...(refreshed.refreshToken ? { refresh_token: encryptToken(refreshed.refreshToken) } : {}),
      })
      .eq('id', conn.id);
    return refreshed.accessToken;
  } catch (err) {
    logGoogleOAuth('error', 'token_refresh_failed', {
      businessId: conn.business_id,
      status: err instanceof GoogleApiError ? err.status : undefined,
      oauthError: err instanceof GoogleApiError ? err.code : undefined,
      message: err instanceof Error ? err.message : String(err),
      hint: 'invalid_grant after ~7 days usually means the OAuth consent screen is still in "Testing" status.',
    });
    if (err instanceof GoogleApiError && err.isAuthRevoked) {
      await admin
        .from('google_business_connections')
        .update({ status: 'needs_reconnect', last_sync_error: 'Google access was revoked or expired. Please reconnect.' })
        .eq('id', conn.id);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadAllReviewRatings(admin: Admin, businessId: string) {
  const out: { google_review_id: string; rating: number; review_date: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('google_reviews')
      .select('google_review_id, rating, review_date')
      .eq('business_id', businessId)
      .order('review_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load reviews: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

async function latestSnapshotOnOrBefore(admin: Admin, businessId: string, date: string): Promise<SnapshotLite | null> {
  const { data } = await admin
    .from('review_metrics_daily')
    .select('date, total_reviews, average_rating, reviews_gained_today')
    .eq('business_id', businessId)
    .lte('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { ...data, average_rating: Number(data.average_rating) } : null;
}

const chunk = <T>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/** Stores drafts (ignoring ones already raised) and emails the owner about new serious ones. */
async function persistAlerts(admin: Admin, businessId: string, drafts: AlertDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const { data: inserted, error } = await admin
    .from('review_alerts')
    .upsert(
      drafts.map((d) => ({ ...d, business_id: businessId })),
      { onConflict: 'business_id,dedupe_key', ignoreDuplicates: true }
    )
    .select('type, title, message');
  if (error) throw new Error(`Failed to save alerts: ${error.message}`);

  const toEmail = (inserted ?? []).filter((a) => shouldEmail(a.type));
  if (toEmail.length > 0) {
    try {
      const { data: business } = await admin.from('businesses').select('owner_id, name').eq('id', businessId).maybeSingle();
      if (business) {
        const { data: owner } = await admin.auth.admin.getUserById(business.owner_id);
        if (owner?.user?.email) {
          for (const alert of toEmail) await sendReviewAlertEmail(owner.user.email, business.name, alert);
        }
      }
    } catch (err) {
      // Email is best-effort; the in-app alert is already stored.
      console.error('[google-sync] alert email failed', err);
    }
  }
  return inserted?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * Synchronises one connected location:
 *   1. fetch the latest reviews (everything on the first run, otherwise only
 *      those updated since the last run, with a day of overlap),
 *   2. insert new reviews and update modified ones (rating/comment/reply),
 *   3. recompute statistics and store today's snapshot (backfilling history
 *      on the first run),
 *   4. raise alerts (not for the historical import).
 * Never throws: failures are recorded on the connection and returned.
 */
export async function syncConnection(
  admin: Admin,
  conn: GoogleBusinessConnection,
  now: Date = new Date()
): Promise<SyncResult> {
  const initial = !conn.initial_sync_done;
  const result: SyncResult = { businessId: conn.business_id, ok: false, initial, fetched: 0, inserted: 0, updated: 0, alerts: 0 };

  if (conn.status === 'needs_reconnect') return { ...result, error: 'Connection needs to be re-authorised.' };
  if (!conn.google_location_id) return { ...result, error: 'No location selected.' };

  try {
    const accessToken = await getAccessToken(admin, conn, now);
    const businessId = conn.business_id;
    const today = dateKey(now);

    // 1. Fetch -------------------------------------------------------------
    const cursor = conn.last_sync_at ? Date.parse(conn.last_sync_at) - INCREMENTAL_OVERLAP_MS : 0;
    const fetched: NormalizedReview[] = [];
    let googleAverage: number | null = null;
    let googleTotal: number | null = null;
    let pageToken: string | undefined;
    let exhausted = false;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = await listReviewsPage(accessToken, conn.google_account_id, conn.google_location_id, pageToken);
      if (page === 0) {
        googleAverage = res.averageRating;
        googleTotal = res.totalReviewCount;
      }
      const normalized = res.reviews.map(normalizeReview).filter((r): r is NormalizedReview => r !== null);
      fetched.push(...normalized);

      if (!res.nextPageToken) {
        exhausted = true;
        break;
      }
      // Reviews are ordered by updateTime desc: once a whole page predates the cursor, the rest is unchanged.
      if (!initial && normalized.length > 0 && normalized.every((r) => Date.parse(r.update_time) < cursor)) {
        break;
      }
      pageToken = res.nextPageToken;
    }
    result.fetched = fetched.length;

    // 2. Insert / update ---------------------------------------------------
    const existing = new Map<string, { update_time: string; reply_text: string | null }>();
    for (const ids of chunk(fetched.map((r) => r.google_review_id), CHUNK)) {
      const { data, error } = await admin
        .from('google_reviews')
        .select('google_review_id, update_time, reply_text')
        .eq('business_id', businessId)
        .in('google_review_id', ids);
      if (error) throw new Error(`Failed to read existing reviews: ${error.message}`);
      for (const row of data ?? []) existing.set(row.google_review_id, row);
    }

    const newReviews = fetched.filter((r) => !existing.has(r.google_review_id));
    const modified = fetched.filter((r) => {
      const prev = existing.get(r.google_review_id);
      return prev && (Date.parse(prev.update_time) !== Date.parse(r.update_time) || (prev.reply_text ?? null) !== r.reply_text);
    });
    result.inserted = newReviews.length;
    result.updated = modified.length;

    const syncedAt = now.toISOString();
    const rows = [...newReviews, ...modified].map((r) => ({ ...r, business_id: businessId, synced_at: syncedAt }));
    for (const part of chunk(rows, CHUNK)) {
      const { error } = await admin.from('google_reviews').upsert(part, { onConflict: 'business_id,google_review_id' });
      if (error) throw new Error(`Failed to save reviews: ${error.message}`);
    }

    // A completed full import is authoritative: drop reviews deleted on Google.
    if (initial && exhausted) {
      const keep = new Set(fetched.map((r) => r.google_review_id));
      const local = await loadAllReviewRatings(admin, businessId);
      const stale = local.filter((r) => !keep.has(r.google_review_id)).map((r) => r.google_review_id);
      for (const ids of chunk(stale, CHUNK)) {
        await admin.from('google_reviews').delete().eq('business_id', businessId).in('google_review_id', ids);
      }
    }

    // 3. Statistics + snapshots -------------------------------------------
    const previousSnapshot = await latestSnapshotOnOrBefore(admin, businessId, addDays(today, -1));
    const all = await loadAllReviewRatings(admin, businessId);

    let snapshots: SnapshotLite[];
    if (initial || !previousSnapshot) {
      snapshots = buildSnapshotsFromReviews(all, today);
    } else {
      const todays = all.filter((r) => dateKey(r.review_date) === today).length;
      snapshots = [
        {
          date: today,
          total_reviews: all.length,
          average_rating: all.length ? Math.round((all.reduce((a, r) => a + r.rating, 0) / all.length) * 100) / 100 : 0,
          reviews_gained_today: todays,
        },
      ];
    }
    // Google's own aggregate (returned with every reviews page) is authoritative for "today".
    const todaySnap = snapshots.find((s) => s.date === today);
    if (todaySnap && googleTotal !== null && googleAverage !== null) {
      todaySnap.total_reviews = googleTotal;
      todaySnap.average_rating = Math.round(googleAverage * 100) / 100;
    }

    for (const part of chunk(snapshots, CHUNK)) {
      const { error } = await admin
        .from('review_metrics_daily')
        .upsert(part.map((s) => ({ ...s, business_id: businessId })), { onConflict: 'business_id,date' });
      if (error) throw new Error(`Failed to save daily metrics: ${error.message}`);
    }

    // 4. Alerts ------------------------------------------------------------
    const currentAverage = todaySnap ? (todaySnap.total_reviews > 0 ? todaySnap.average_rating : null) : null;
    const lastMonthSnap = await latestSnapshotOnOrBefore(admin, businessId, previousMonthEnd(today));
    const lastMonth = statsAsOf(lastMonthSnap ? [lastMonthSnap] : [], [], previousMonthEnd(today));

    const drafts = buildAlerts({
      suppress: initial,
      newReviews: newReviews.map((r) => ({
        google_review_id: r.google_review_id,
        reviewer_name: r.reviewer_name,
        rating: r.rating,
        comment: r.comment,
      })),
      today,
      currentAverage,
      previousAverage: previousSnapshot && previousSnapshot.total_reviews > 0 ? previousSnapshot.average_rating : null,
      lastMonthAverage: lastMonth.average,
      threshold: Number(conn.rating_alert_threshold),
    });
    result.alerts = await persistAlerts(admin, businessId, drafts);

    // 5. Done --------------------------------------------------------------
    await admin
      .from('google_business_connections')
      .update({ last_sync_at: syncedAt, last_sync_error: null, initial_sync_done: true, status: 'active' })
      .eq('id', conn.id);

    return { ...result, ok: true };
  } catch (err) {
    const message = describeGoogleError(err);
    logGoogleOAuth('error', 'api_call_failed', {
      businessId: conn.business_id,
      status: err instanceof GoogleApiError ? err.status : undefined,
      kind: err instanceof GoogleApiError ? err.kind : undefined,
      reason: err instanceof GoogleApiError ? err.reason : undefined,
      activationUrl: err instanceof GoogleApiError ? err.activationUrl : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
    if (!(err instanceof GoogleApiError && err.isAuthRevoked)) {
      await admin.from('google_business_connections').update({ last_sync_error: message.slice(0, 500) }).eq('id', conn.id);
    }
    return { ...result, error: message };
  }
}

/** Cron entry point: syncs every connection that has a location and valid access. */
export async function syncAllConnections(admin: Admin = createAdminClient()): Promise<SyncResult[]> {
  const { data, error } = await admin
    .from('google_business_connections')
    .select('*')
    .eq('status', 'active')
    .not('google_location_id', 'is', null);
  if (error) throw new Error(`Failed to load connections: ${error.message}`);

  const results: SyncResult[] = [];
  for (const conn of data ?? []) results.push(await syncConnection(admin, conn));
  return results;
}
