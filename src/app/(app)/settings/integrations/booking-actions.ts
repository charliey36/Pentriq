'use server';

import { revalidatePath } from 'next/cache';
import { requireBusiness } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { isProviderId } from '@/lib/booking-sync/registry';
import { syncBookingConnection } from '@/lib/booking-sync/sync';

export type BookingActionResult = { ok: boolean; message: string };

const MIN_GAP_MS = 60_000;

async function load(provider: string) {
  const business = await requireBusiness();
  if (!isProviderId(provider)) return { business, conn: null };
  const { data } = await createAdminClient().from('booking_connections').select('*').eq('business_id', business.id).eq('provider', provider).maybeSingle();
  return { business, conn: data };
}

/** "Sync now": the same sync the daily job runs. Rate limited so it can't be hammered. */
export async function syncBookingNow(provider: string): Promise<BookingActionResult> {
  const { conn } = await load(provider);
  if (!conn || conn.status !== 'active') return { ok: false, message: 'This booking system is not connected.' };
  if (Date.now() - Date.parse(conn.updated_at) < MIN_GAP_MS) return { ok: false, message: 'Just synced. Please wait a minute and try again.' };
  const outcome = await syncBookingConnection(createAdminClient(), conn);
  revalidatePath('/settings/integrations');
  revalidatePath('/dashboard');
  revalidatePath('/customers');
  return { ok: outcome.status === 'ok', message: outcome.message };
}

/** Disconnect: forget the tokens and stop syncing. Customers and visits already imported are kept. */
export async function disconnectBooking(provider: string): Promise<BookingActionResult> {
  const { conn } = await load(provider);
  if (!conn) return { ok: false, message: 'Not connected.' };
  const { error } = await createAdminClient()
    .from('booking_connections')
    .update({ status: 'disconnected', access_token_enc: null, refresh_token_enc: null, token_expires_at: null, updated_at: new Date().toISOString() })
    .eq('id', conn.id);
  if (error) return { ok: false, message: 'Could not disconnect. Please try again.' };
  revalidatePath('/settings/integrations');
  return { ok: true, message: 'Disconnected. Customers you already imported are kept.' };
}
