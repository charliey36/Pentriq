'use server';

import { revalidatePath } from 'next/cache';
import { requireBusiness } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConnectionWithTokens } from '@/lib/google-connection';
import { decryptToken } from '@/lib/google-token-crypto';
import { describeGoogleError, listAllLocations, revokeToken } from '@/lib/google-business';
import { getAccessToken, syncConnection } from '@/lib/google-review-sync';
import { rebuildMetrics, setSource } from '@/lib/reputation-data';

export type ActionResult = { ok: boolean; message: string };

const MIN_SYNC_GAP_MS = 30_000;

function refresh() {
  revalidatePath('/settings/integrations');
  revalidatePath('/reviews');
  revalidatePath('/', 'layout');
}

/** Locations the connected Google user can manage (for the picker). */
export async function loadGoogleLocations() {
  const business = await requireBusiness();
  const conn = await getConnectionWithTokens(business.id);
  if (!conn) return { locations: [], error: 'Not connected.' };
  try {
    const token = await getAccessToken(createAdminClient(), conn);
    return { locations: await listAllLocations(token), error: null };
  } catch (err) {
    return { locations: [], error: describeGoogleError(err) };
  }
}

/** Saves the chosen location and runs the initial review sync. `value` is "accountId/locationId". */
export async function selectGoogleLocation(value: string): Promise<ActionResult> {
  const business = await requireBusiness();
  const conn = await getConnectionWithTokens(business.id);
  if (!conn) return { ok: false, message: 'Connect your Google account first.' };

  const [accountId, locationId] = value.split('/');
  if (!accountId || !locationId) return { ok: false, message: 'Choose a location.' };

  // Re-validate against what the user can actually manage rather than trusting the form value.
  const { locations, error } = await loadGoogleLocations();
  if (error) return { ok: false, message: error };
  const chosen = locations.find((l) => l.accountId === accountId && l.locationId === locationId);
  if (!chosen) return { ok: false, message: 'That location is not available on this Google account.' };

  const admin = createAdminClient();

  // A different location means different reviews: clear the old location's data.
  if (conn.google_location_id && conn.google_location_id !== locationId) {
    await admin.from('google_reviews').delete().eq('business_id', business.id);
    await admin.from('review_metrics_daily').delete().eq('business_id', business.id);
    await admin.from('review_alerts').delete().eq('business_id', business.id);
  }

  const { data: updated, error: updateError } = await admin
    .from('google_business_connections')
    .update({
      google_account_id: accountId,
      google_account_name: chosen.accountName,
      google_location_id: locationId,
      location_name: chosen.title,
      status: 'active',
      initial_sync_done: conn.google_location_id === locationId ? conn.initial_sync_done : false,
      last_sync_at: conn.google_location_id === locationId ? conn.last_sync_at : null,
      last_sync_error: null,
    })
    .eq('id', conn.id)
    .select('*')
    .single();
  if (updateError || !updated) return { ok: false, message: 'Could not save the location. Please try again.' };

  if (!business.google_review_url?.trim() && chosen.reviewUrl) {
    const { error: reviewUrlError } = await admin
      .from('businesses')
      .update({ google_review_url: chosen.reviewUrl })
      .eq('id', business.id);
    if (reviewUrlError) return { ok: false, message: 'Location connected, but the Google review link could not be saved.' };
  }

  await setSource(admin, business.id, 'google', 'Google Business Profile', true);
  await admin.from('google_business_locations').upsert(
    { business_id: business.id, google_account_id: accountId, google_location_id: locationId, title: chosen.title, address: chosen.address },
    { onConflict: 'business_id,google_account_id,google_location_id' }
  );
  const result = await syncConnection(admin, updated);
  refresh();
  return result.ok
    ? { ok: true, message: `Connected to ${chosen.title}. Imported ${result.fetched} review${result.fetched === 1 ? '' : 's'}.` }
    : { ok: false, message: `Connected, but the first sync failed: ${result.error}` };
}

/** Lets the user pick a different location (reviews are replaced when they choose). */
export async function startChangeLocation(): Promise<ActionResult> {
  const business = await requireBusiness();
  await createAdminClient()
    .from('google_business_connections')
    .update({ status: 'pending_location' })
    .eq('business_id', business.id);
  refresh();
  return { ok: true, message: 'Choose a location.' };
}

export async function syncGoogleNow(): Promise<ActionResult> {
  const business = await requireBusiness();
  const conn = await getConnectionWithTokens(business.id);
  if (!conn || !conn.google_location_id) return { ok: false, message: 'Connect Google Business Profile first.' };
  if (conn.last_sync_at && Date.now() - Date.parse(conn.last_sync_at) < MIN_SYNC_GAP_MS) {
    return { ok: false, message: 'Synced moments ago. Try again in a few seconds.' };
  }
  const result = await syncConnection(createAdminClient(), conn, new Date(), 'manual');
  refresh();
  return result.ok
    ? { ok: true, message: `Sync complete: ${result.inserted} new, ${result.updated} updated.` }
    : { ok: false, message: `Sync failed: ${result.error}` };
}

export async function updateRatingThreshold(threshold: number): Promise<ActionResult> {
  const business = await requireBusiness();
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 5) {
    return { ok: false, message: 'Enter a threshold between 1.0 and 5.0.' };
  }
  const rounded = Math.round(threshold * 10) / 10;
  const { error } = await createAdminClient()
    .from('google_business_connections')
    .update({ rating_alert_threshold: rounded })
    .eq('business_id', business.id);
  if (error) return { ok: false, message: 'Could not save the threshold.' };
  refresh();
  return { ok: true, message: `You'll be alerted if your average rating falls below ${rounded.toFixed(1)}\u2605.` };
}

/** Revokes Google access and removes the connection plus data synced from it. */
export async function disconnectGoogle(): Promise<ActionResult> {
  const business = await requireBusiness();
  const conn = await getConnectionWithTokens(business.id);
  if (!conn) return { ok: true, message: 'Already disconnected.' };

  try {
    await revokeToken(decryptToken(conn.refresh_token));
  } catch {
    /* revocation is best effort; we delete our copy regardless */
  }

  const admin = createAdminClient();
  await admin.from('google_reviews').delete().eq('business_id', business.id);
  await admin.from('review_metrics_daily').delete().eq('business_id', business.id);
  await admin.from('review_alerts').delete().eq('business_id', business.id);
  await admin.from('google_business_locations').delete().eq('business_id', business.id);
  const { error } = await admin.from('google_business_connections').delete().eq('business_id', business.id);
  if (error) return { ok: false, message: 'Could not disconnect. Please try again.' };
  await setSource(admin, business.id, 'google', 'Google Business Profile', false);
  await rebuildMetrics(admin, business.id).catch(() => undefined); // falls back to manual snapshots

  refresh();
  return { ok: true, message: 'Google Business Profile disconnected.' };
}
