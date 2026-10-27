/**
 * Runs one booking-system sync: refresh the token if needed, fetch appointments
 * that have finished since the last sync, and hand them to the same import used
 * for CSV files (customer matching, duplicate skipping, opt-outs, frequency
 * limit, review scheduling, staff/service personalisation).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { bulkImportWithRecovery } from '@/lib/customers';
import { decryptToken, encryptToken } from '@/lib/google-token-crypto';
import { PROVIDERS } from './registry';
import { DAY_MS, ReconnectRequired, type FetchLike } from './types';

type Db = SupabaseClient<Database>;
type Connection = Database['public']['Tables']['booking_connections']['Row'];

/** First sync looks back this far so recent customers and visits appear straight away. */
export const FIRST_SYNC_DAYS = 60;
/** Later syncs re-read a day of overlap; the import skips anything it already has. */
export const OVERLAP_MS = DAY_MS;
const REFRESH_MARGIN_MS = 5 * 60_000;

export type SyncOutcome = {
  status: 'ok' | 'reconnect' | 'error';
  message: string;
  customersCreated: number;
  visitsAdded: number;
  skippedNoEmail: number;
  queued: number;
};

const empty = (status: SyncOutcome['status'], message: string): SyncOutcome => ({ status, message, customersCreated: 0, visitsAdded: 0, skippedNoEmail: 0, queued: 0 });

export function syncWindow(lastSyncedAt: string | null, now: Date): { from: Date; to: Date } {
  const last = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
  const from = Number.isNaN(last) ? new Date(now.getTime() - FIRST_SYNC_DAYS * DAY_MS) : new Date(last - OVERLAP_MS);
  return { from, to: now };
}

export function describeOutcome(o: Pick<SyncOutcome, 'customersCreated' | 'visitsAdded' | 'skippedNoEmail' | 'queued'>): string {
  const parts = [`${o.visitsAdded} new appointment${o.visitsAdded === 1 ? '' : 's'}`, `${o.customersCreated} new customer${o.customersCreated === 1 ? '' : 's'}`];
  if (o.queued) parts.push(`${o.queued} review request${o.queued === 1 ? '' : 's'} scheduled`);
  if (o.skippedNoEmail) parts.push(`${o.skippedNoEmail} skipped (no email address)`);
  return parts.join(', ');
}

export async function syncBookingConnection(admin: Db, conn: Connection, opts: { now?: Date; fetch?: FetchLike } = {}): Promise<SyncOutcome> {
  const now = opts.now ?? new Date();
  const provider = PROVIDERS[conn.provider];
  const f = opts.fetch;

  const record = async (outcome: SyncOutcome, extra: Partial<Database['public']['Tables']['booking_connections']['Update']> = {}) => {
    await admin
      .from('booking_connections')
      .update({
        last_sync_status: outcome.status,
        last_sync_message: outcome.message,
        ...(outcome.status === 'ok' ? { last_synced_at: now.toISOString(), last_sync_imported: outcome.visitsAdded } : {}),
        ...(outcome.status === 'reconnect' ? { status: 'needs_reconnect' as const } : {}),
        updated_at: now.toISOString(),
        ...extra,
      })
      .eq('id', conn.id);
    return outcome;
  };

  if (conn.status !== 'active' || !conn.access_token_enc) return empty('error', 'Not connected.');
  if (!provider.isConfigured()) return record(empty('error', `${provider.label} is not configured on this server.`));

  try {
    let accessToken = decryptToken(conn.access_token_enc);
    let tokenUpdate: Partial<Database['public']['Tables']['booking_connections']['Update']> = {};

    const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : null;
    if (expiresAt !== null && expiresAt - now.getTime() < REFRESH_MARGIN_MS) {
      if (!provider.refresh || !conn.refresh_token_enc) throw new ReconnectRequired('Access expired and cannot be refreshed.');
      const fresh = await provider.refresh({ refreshToken: decryptToken(conn.refresh_token_enc) }, f);
      accessToken = fresh.accessToken;
      tokenUpdate = {
        access_token_enc: encryptToken(fresh.accessToken),
        refresh_token_enc: fresh.refreshToken ? encryptToken(fresh.refreshToken) : conn.refresh_token_enc,
        token_expires_at: fresh.expiresAt ?? null,
      };
    }

    const { from, to } = syncWindow(conn.last_synced_at, now);
    const { rows, skippedNoEmail } = await provider.fetchCompleted(accessToken, { from, to }, f);

    const { data: business } = await admin.from('businesses').select('*').eq('id', conn.business_id).single();
    if (!business) return record(empty('error', 'Business not found.'), tokenUpdate);

    const summary = rows.length
      ? await bulkImportWithRecovery(
          admin,
          {
            id: business.id,
            delay_hours: business.delay_hours,
            review_request_window_days: business.review_request_window_days ?? 1,
            review_cooldown_enabled: business.review_cooldown_enabled,
            review_cooldown_days: business.review_cooldown_days,
            quiet_repeats: true,
          },
          rows,
          true,
          conn.consent_confirmed_at
        )
      : null;

    const outcome: SyncOutcome = {
      status: 'ok',
      message: '',
      customersCreated: summary?.customersCreated ?? 0,
      visitsAdded: summary?.serviceRecordsAdded ?? 0,
      skippedNoEmail,
      queued: summary?.queued ?? 0,
    };
    outcome.message = describeOutcome(outcome);
    return record(outcome, tokenUpdate);
  } catch (e) {
    if (e instanceof ReconnectRequired) return record(empty('reconnect', 'Pentriq lost access to your account. Reconnect to resume syncing.'));
    const message = e instanceof Error ? e.message : 'Sync failed.';
    return record(empty('error', message.slice(0, 300)));
  }
}
