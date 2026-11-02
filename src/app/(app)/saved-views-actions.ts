'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCapability } from '@/lib/business-access';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { MAX_VIEWS_PER_SCOPE, SCOPE_PATHS, validateView } from '@/lib/saved-views';

export type SavedViewResult = { ok: boolean; message: string; id?: string };

/** Saves a named, team-shared filter. saved_views is server-only, so every read and write goes through here. */
export async function createSavedView(scope: string, name: string, query: string): Promise<SavedViewResult> {
  const { business, userId, email } = await requireCapability('customers.read');
  const parsed = validateView({ scope, name, query });
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const db = createAdminClient();
  const { count } = await db.from('saved_views').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('scope', parsed.scope);
  if ((count ?? 0) >= MAX_VIEWS_PER_SCOPE) return { ok: false, message: `You can save up to ${MAX_VIEWS_PER_SCOPE} views here. Delete one first.` };

  const { data, error } = await db
    .from('saved_views')
    .insert({ business_id: business.id, created_by: userId, scope: parsed.scope, name: parsed.name, query: parsed.query, shared: true })
    .select('id')
    .single();
  if (error || !data) return { ok: false, message: 'Could not save the view. Please try again.' };

  await recordAudit({ action: 'saved_view.created', businessId: business.id, actorId: userId, actorEmail: email, targetType: 'saved_view', targetId: data.id, metadata: { scope: parsed.scope } });
  revalidatePath(SCOPE_PATHS[parsed.scope]);
  return { ok: true, message: `Saved “${parsed.name}”.`, id: data.id };
}

/** The creator, or an owner/admin, may delete a view. */
export async function deleteSavedView(id: string): Promise<SavedViewResult> {
  const { business, userId, email, role } = await requireCapability('customers.read');
  const db = createAdminClient();
  const { data: view } = await db.from('saved_views').select('id, scope, created_by').eq('id', id).eq('business_id', business.id).maybeSingle();
  if (!view) return { ok: false, message: 'View not found.' };
  if (view.created_by !== userId && !can(role, 'team.manage')) return { ok: false, message: 'Only the person who saved it, or an admin, can delete this view.' };

  await db.from('saved_views').delete().eq('id', id).eq('business_id', business.id);
  await recordAudit({ action: 'saved_view.deleted', businessId: business.id, actorId: userId, actorEmail: email, targetType: 'saved_view', targetId: id });
  revalidatePath(SCOPE_PATHS[view.scope as keyof typeof SCOPE_PATHS] ?? '/customers');
  return { ok: true, message: 'View deleted.' };
}
