'use server';

import { revalidatePath } from 'next/cache';
import { requireBusiness } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { dateKey } from '@/lib/google-review-analytics';
import { rebuildMetrics, setSource } from '@/lib/reputation-data';
import { validateSnapshot } from '@/lib/reputation-metrics';

export type ReputationResult = { ok: boolean; message: string };

function refresh() {
  revalidatePath('/settings/reputation');
  revalidatePath('/reviews');
  revalidatePath('/', 'layout');
}

async function after(businessId: string) {
  const db = createAdminClient();
  const { count } = await db.from('manual_review_snapshots').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
  await setSource(db, businessId, 'manual', 'Manual tracking', (count ?? 0) > 0);
  await rebuildMetrics(db, businessId);
  refresh();
}

/** Raises an in-app alert when a new snapshot shows the average rating dropped. */
async function alertOnDrop(businessId: string, date: string, rating: number) {
  const db = createAdminClient();
  const { data: prev } = await db
    .from('manual_review_snapshots')
    .select('snapshot_date, average_rating')
    .eq('business_id', businessId)
    .lt('snapshot_date', date)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prev || Number(prev.average_rating) - rating < 0.1) return;
  await db.from('review_alerts').upsert(
    {
      business_id: businessId,
      type: 'rating_decrease' as const,
      title: 'Average rating went down',
      message: `Your average rating is ${rating.toFixed(1)}\u2605, down from ${Number(prev.average_rating).toFixed(1)}\u2605 at your previous snapshot.`,
      dedupe_key: `manual_rating_decrease:${date}`,
    },
    { onConflict: 'business_id,dedupe_key', ignoreDuplicates: true }
  );
}

/** Creates a snapshot, or replaces the one already saved for that date. */
export async function saveSnapshot(date: string, count: number, rating: number): Promise<ReputationResult> {
  const business = await requireBusiness();
  const error = validateSnapshot({ date, count, rating }, dateKey(new Date()));
  if (error) return { ok: false, message: error };

  const { error: dbError } = await createAdminClient()
    .from('manual_review_snapshots')
    .upsert({ business_id: business.id, snapshot_date: date, review_count: count, average_rating: count === 0 ? 0 : rating }, { onConflict: 'business_id,snapshot_date' });
  if (dbError) return { ok: false, message: 'Could not save the snapshot. Has migration 0021 been applied?' };

  await alertOnDrop(business.id, date, rating);
  await after(business.id);
  return { ok: true, message: 'Snapshot saved.' };
}

/** Corrects an existing snapshot (date, count and rating can all change). */
export async function updateSnapshot(id: string, date: string, count: number, rating: number): Promise<ReputationResult> {
  const business = await requireBusiness();
  const error = validateSnapshot({ date, count, rating }, dateKey(new Date()));
  if (error) return { ok: false, message: error };

  const { error: dbError } = await createAdminClient()
    .from('manual_review_snapshots')
    .update({ snapshot_date: date, review_count: count, average_rating: count === 0 ? 0 : rating })
    .eq('id', id)
    .eq('business_id', business.id);
  if (dbError) {
    return { ok: false, message: dbError.code === '23505' ? 'You already have a snapshot for that date.' : 'Could not update the snapshot.' };
  }
  await after(business.id);
  return { ok: true, message: 'Snapshot updated.' };
}

export async function deleteSnapshot(id: string): Promise<ReputationResult> {
  const business = await requireBusiness();
  const { error } = await createAdminClient().from('manual_review_snapshots').delete().eq('id', id).eq('business_id', business.id);
  if (error) return { ok: false, message: 'Could not delete the snapshot.' };
  await after(business.id);
  return { ok: true, message: 'Snapshot deleted.' };
}

/** Rebuilds every monthly metric from the stored snapshots. */
export async function recalculateAnalytics(): Promise<ReputationResult> {
  const business = await requireBusiness();
  try {
    const months = await rebuildMetrics(createAdminClient(), business.id);
    refresh();
    return { ok: true, message: `Analytics rebuilt for ${months} month${months === 1 ? '' : 's'}.` };
  } catch {
    return { ok: false, message: 'Could not rebuild analytics.' };
  }
}
