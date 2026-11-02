'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireBusiness, isAdminEmail } from '@/lib/business';
import { recordAudit } from '@/lib/audit';

/**
 * Admin-only hard delete of an organisation. Deleting the business row
 * cascades to customers, review requests, messages, feedback, journeys, etc.
 * (all FKs are `on delete cascade`); then its member auth users are removed.
 */
export async function deleteOrganisation(businessId: string): Promise<{ error?: string }> {
  const own = await requireBusiness();
  const { data } = await createClient().auth.getUser();
  if (!isAdminEmail(data.user?.email)) return { error: 'Not authorised.' };
  if (businessId === own.id) return { error: 'You cannot delete your own organisation.' };

  const admin = createAdminClient();
  const { data: members } = await admin.from('business_members').select('user_id').eq('business_id', businessId);

  const { error } = await admin.from('businesses').delete().eq('id', businessId);
  if (error) return { error: `Delete failed: ${error.message}` };

  await admin.storage.from('business-logos').remove(['png', 'jpg', 'webp'].map((e) => `${businessId}/logo.${e}`));
  for (const m of members ?? []) {
    if (m.user_id === data.user?.id) continue;
    await admin.auth.admin.deleteUser(m.user_id);
  }

  await recordAudit({ action: 'admin.organisation_deleted', actorId: data.user?.id, actorEmail: data.user?.email, targetType: 'business', targetId: businessId });
  revalidatePath('/admin/organisations');
  return {};
}
