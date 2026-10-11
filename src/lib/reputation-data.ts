import type { createAdminClient } from '@/lib/supabase/admin';
import { dateKey, type SnapshotLite } from '@/lib/google-review-analytics';
import { monthlyMetrics, toSnapshots } from '@/lib/reputation-metrics';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Where the dashboard's numbers come from. Both sources reduce to the same
 * SnapshotLite[] shape, so when Google data exists the existing analytics and
 * charts use it with no other changes.
 *   - 'google': review_metrics_daily, written by the Google review sync
 *   - 'manual': manual_review_snapshots, entered in Settings → Reputation Tracking
 */
export type ReputationSource = 'google' | 'manual';

export async function loadManualSnapshots(db: Admin, businessId: string): Promise<SnapshotLite[]> {
  const { data } = await db
    .from('manual_review_snapshots')
    .select('snapshot_date, review_count, average_rating')
    .eq('business_id', businessId)
    .order('snapshot_date', { ascending: true })
    .limit(5000);
  return toSnapshots(data ?? []);
}

export async function loadGoogleSnapshots(db: Admin, businessId: string): Promise<SnapshotLite[]> {
  const out: SnapshotLite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('review_metrics_daily')
      .select('date, total_reviews, average_rating, reviews_gained_today')
      .eq('business_id', businessId)
      .order('date', { ascending: true })
      .range(from, from + 999);
    out.push(...(data ?? []).map((s) => ({ ...s, average_rating: Number(s.average_rating) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Google data wins as soon as the synced location has produced snapshots; otherwise manual entries are used. */
export async function loadReputation(db: Admin, businessId: string, googleActive: boolean) {
  if (googleActive) {
    const google = await loadGoogleSnapshots(db, businessId);
    if (google.length > 0) return { source: 'google' as const, snapshots: google };
  }
  return { source: 'manual' as const, snapshots: await loadManualSnapshots(db, businessId) };
}

export async function setSource(db: Admin, businessId: string, type: ReputationSource, name: string, connected: boolean) {
  await db
    .from('review_sources')
    .upsert({ business_id: businessId, source_type: type, source_name: name, connected }, { onConflict: 'business_id,source_type' });
}

/** Recomputes the monthly `review_metrics` roll-up from the active source. Safe to call any time (idempotent). */
export async function rebuildMetrics(db: Admin, businessId: string): Promise<number> {
  const { data: conn } = await db
    .from('google_business_connections')
    .select('status, google_location_id')
    .eq('business_id', businessId)
    .maybeSingle();
  const { snapshots } = await loadReputation(db, businessId, conn?.status === 'active' && Boolean(conn.google_location_id));

  const rows = monthlyMetrics(snapshots, dateKey(new Date())).map((m) => ({ ...m, business_id: businessId, calculated_at: new Date().toISOString() }));
  await db.from('review_metrics').delete().eq('business_id', businessId);
  if (rows.length > 0) {
    const { error } = await db.from('review_metrics').insert(rows);
    if (error) throw new Error(`Could not save metrics: ${error.message}`);
  }
  return rows.length;
}
