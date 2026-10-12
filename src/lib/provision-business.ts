import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { captureError } from '@/lib/monitoring';

type Db = SupabaseClient<Database>;

/**
 * The journeys every business starts with. This is the single source of truth:
 * new accounts are provisioned from it (below), and supabase/schema.sql carries
 * the same definitions for the one-off backfill of businesses that pre-date it.
 */
export const DEFAULT_JOURNEYS = [
  {
    key: 'review_sequence',
    name: 'Review request sequence',
    steps: [
      { wait_hours: 0, channel: 'email', purpose: 'review_request' },
      { wait_hours: 72, channel: 'email', purpose: 'review_reminder' },
      { wait_hours: 168, channel: 'email', purpose: 'review_reminder' },
    ],
  },
  { key: 'rebooking_reminder', name: 'Rebooking reminder', steps: [{ wait_hours: 0, channel: 'email', purpose: 'rebooking_reminder' }] },
  { key: 'win_back', name: 'Win-back campaign', steps: [{ wait_hours: 0, channel: 'email', purpose: 'win_back' }] },
  { key: 'birthday', name: 'Birthday campaign', steps: [{ wait_hours: 0, channel: 'email', purpose: 'birthday' }] },
] as const;

export type ProvisionResult = {
  business: Database['public']['Tables']['businesses']['Row'];
  /** True when this call created the business (so the welcome email should go out). */
  created: boolean;
};

/**
 * First-login provisioning for a user with no business yet: the business row,
 * the owner membership, and the default journeys.
 *
 * MUST be called with the service-role client. Row level security deliberately
 * gives a brand-new user no way to create their own membership (a policy that
 * did would let anyone add themselves to any business), and a user cannot read
 * back a business they are not yet a member of. Creating these rows is a
 * server-side responsibility; the caller has already verified who the user is.
 *
 * Idempotent and safe under concurrency: the layout and the page can both reach
 * this for the same new user at once. The unique(owner_id) constraint decides
 * the winner, and every later step is an upsert.
 */
export async function provisionBusiness(admin: Db, userId: string): Promise<ProvisionResult> {
  const { data: inserted, error: insertError } = await admin
    .from('businesses')
    .upsert({ owner_id: userId }, { onConflict: 'owner_id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle();
  if (insertError) throw new Error(`Failed to create business: ${insertError.message}`);

  // ignoreDuplicates returns no row when the other request won the race; read theirs.
  let business = inserted;
  const created = Boolean(inserted);
  if (!business) {
    const { data: existing, error } = await admin.from('businesses').select('*').eq('owner_id', userId).single();
    if (error || !existing) throw new Error(`Failed to load business: ${error?.message ?? 'not found'}`);
    business = existing;
  }

  const { error: memberError } = await admin
    .from('business_members')
    .upsert({ business_id: business.id, user_id: userId, role: 'owner' }, { onConflict: 'business_id,user_id', ignoreDuplicates: true });
  if (memberError) throw new Error(`Failed to create membership: ${memberError.message}`);

  const { error: journeyError } = await admin.from('journeys').upsert(
    DEFAULT_JOURNEYS.map((j) => ({ business_id: business.id, key: j.key, name: j.name, steps: j.steps as unknown as never })),
    { onConflict: 'business_id,key', ignoreDuplicates: true }
  );
  // Journeys are recoverable (the sender falls back to a single request); never block sign-in on them.
  if (journeyError) captureError(journeyError, { area: 'provision:default-journeys', tags: { business_id: business.id } });

  return { business, created };
}
