'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser, requireBusiness } from '@/lib/business';
import { adminAccess } from '@/lib/admin-access';
import { recordAudit } from '@/lib/audit';

/**
 * Admin-only hard delete of an organisation. Deleting the business row
 * cascades to customers, review requests, messages, feedback, journeys, etc.
 * (all FKs are `on delete cascade`); then its member auth users are removed.
 */
export async function deleteOrganisation(businessId: string): Promise<{ error?: string }> {
  const own = await requireBusiness();
  const me = await getAuthUser();
  const access = adminAccess(me);
  if (access === 'forbidden' || !me) return { error: 'Not authorised.' };
  if (access !== 'ok') return { error: 'Admin actions need a two-factor session. Sign in again with your authenticator code.' };
  if (businessId === own.id) return { error: 'You cannot delete your own organisation.' };

  const admin = createAdminClient();
  const { data: members } = await admin.from('business_members').select('user_id').eq('business_id', businessId);

  const { error } = await admin.from('businesses').delete().eq('id', businessId);
  if (error) return { error: `Delete failed: ${error.message}` };

  await admin.storage.from('business-logos').remove(['png', 'jpg', 'webp'].map((e) => `${businessId}/logo.${e}`));
  for (const m of members ?? []) {
    if (m.user_id === me.id) continue;
    await admin.auth.admin.deleteUser(m.user_id);
  }

  await recordAudit({ action: 'admin.organisation_deleted', actorId: me.id, actorEmail: me.email, targetType: 'business', targetId: businessId });
  revalidatePath('/admin/organisations');
  return {};
}
