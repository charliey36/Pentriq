import { createAdminClient } from '@/lib/supabase/admin';
import type { GoogleBusinessConnection } from '@/lib/database.types';

/**
 * Connection data that is safe to hand to pages and client components: the
 * encrypted token columns are deliberately not part of this shape.
 */
export type PublicGoogleConnection = Pick<
  GoogleBusinessConnection,
  | 'id'
  | 'status'
  | 'google_location_id'
  | 'location_name'
  | 'rating_alert_threshold'
  | 'initial_sync_done'
  | 'last_sync_error'
  | 'connected_at'
  | 'last_sync_at'
>;

const PUBLIC_COLUMNS =
  'id, status, google_location_id, location_name, rating_alert_threshold, initial_sync_done, last_sync_error, connected_at, last_sync_at';

/** Server-only: reads via the service role (the table has no RLS policies). */
export async function getPublicConnection(businessId: string): Promise<PublicGoogleConnection | null> {
  const { data } = await createAdminClient()
    .from('google_business_connections')
    .select(PUBLIC_COLUMNS)
    .eq('business_id', businessId)
    .maybeSingle();
  return (data as PublicGoogleConnection | null) ?? null;
}

/** Server-only: includes encrypted tokens. Never pass the result to a client component. */
export async function getConnectionWithTokens(businessId: string): Promise<GoogleBusinessConnection | null> {
  const { data } = await createAdminClient()
    .from('google_business_connections')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();
  return data ?? null;
}
