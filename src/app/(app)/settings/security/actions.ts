'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/business-access';
import { recordAudit } from '@/lib/audit';
import { parseRetentionDays } from '@/lib/retention';
import { getAuthUser } from '@/lib/business';

export type RetentionResult = { error?: string; success?: boolean };

/** Owner-only: deleting data on a schedule is as consequential as deleting the account. */
export async function saveRetentionPolicy(_prev: RetentionResult, formData: FormData): Promise<RetentionResult> {
  const { business, userId, email } = await requireCapability('account.delete');
  const parsed = parseRetentionDays(formData.get('data_retention_days'));
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await createClient()
    .from('businesses')
    .update({ data_retention_days: parsed.days })
    .eq('id', business.id)
    .select('id');
  if (error) {
    return { error: /data_retention_days/.test(error.message) ? 'Apply database migration 0044 to enable retention policies.' : 'Could not save. Please try again.' };
  }
  if (!data || data.length === 0) return { error: 'Could not save. Please try again.' };

  await recordAudit({
    action: 'settings.retention_changed',
    businessId: business.id,
    actorId: userId,
    actorEmail: email,
    targetType: 'business',
    targetId: business.id,
    metadata: { days: parsed.days, previous: business.data_retention_days ?? null },
  });
  revalidatePath('/settings/security');
  return { success: true };
}

export type MfaPolicyResult = { error?: string; success?: boolean; enabled?: boolean };

/**
 * Owner-only: require two-factor authentication for every member. The owner must have it set up first, so
 * turning the policy on can never lock the owner out mid-session.
 */
export async function setRequireMfa(enabled: boolean): Promise<MfaPolicyResult> {
  const { business, userId, email } = await requireCapability('account.delete');
  const user = await getAuthUser();
  if (enabled && !(user?.mfaEnrolled || user?.aal === 'aal2')) {
    return { error: 'Set up two-factor on your own account first (Account security), then turn this on.' };
  }
  const { data, error } = await createClient().from('businesses').update({ require_mfa: enabled }).eq('id', business.id).select('id');
  if (error) {
    return { error: /require_mfa/.test(error.message) ? 'Apply database migration 0045 to enable this policy.' : 'Could not save. Please try again.' };
  }
  if (!data || data.length === 0) return { error: 'Could not save. Please try again.' };
  await recordAudit({
    action: 'security.mfa_policy_changed',
    businessId: business.id,
    actorId: userId,
    actorEmail: email,
    targetType: 'business',
    targetId: business.id,
    metadata: { require_mfa: enabled },
  });
  revalidatePath('/settings/security');
  revalidatePath('/settings/team');
  return { success: true, enabled };
}
