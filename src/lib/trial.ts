import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingState, TRIAL_DAYS, type BillingInput } from '@/lib/billing';

/**
 * Starts the free trial if (and only if) it has never been started. Conditional on
 * `trial_ends_at IS NULL`, so double clicks, two tabs or a repeat call can never restart
 * or extend it. Returns true when this call started the trial.
 * Also makes anything queued before the trial started due now instead of up to a day later.
 */
export async function startTrialIfAvailable(business: BillingInput & { id: string }, now = new Date()): Promise<boolean> {
  if (getBillingState(business, now).status !== 'trial_available') return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('businesses')
    .update({
      trial_claimed_at: now.toISOString(),
      trial_ends_at: new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString(),
      subscription_status: 'trialing',
    })
    .eq('id', business.id)
    .eq('subscription_status', 'trialing')
    .is('trial_ends_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) return false;

  await admin
    .from('messages')
    .update({ next_attempt_at: now.toISOString() })
    .eq('business_id', business.id)
    .in('status', ['queued', 'pending'])
    .gt('next_attempt_at', now.toISOString());
  return true;
}
