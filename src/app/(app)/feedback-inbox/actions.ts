'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/business-access';
import { recordAudit } from '@/lib/audit';
import { emitWebhookEvent } from '@/lib/webhooks';
import { createAdminClient } from '@/lib/supabase/admin';

export type FeedbackStatus = 'new' | 'acknowledged' | 'resolved';
export type BulkFeedbackResult = { ok: boolean; updated: number; message: string };

const STATUSES: readonly FeedbackStatus[] = ['new', 'acknowledged', 'resolved'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BULK_FEEDBACK_LIMIT = 100;

function cleanIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((v): v is string => typeof v === 'string' && UUID.test(v)))].slice(0, BULK_FEEDBACK_LIMIT);
}

export async function updateFeedbackStatus(feedbackId: string, status: FeedbackStatus) {
  const { business } = await requireCapability('customers.write');
  if (!STATUSES.includes(status) || !UUID.test(feedbackId)) return;
  const supabase = createClient();

  const { data } = await supabase
    .from('private_feedback')
    .update({ status })
    .eq('id', feedbackId)
    .eq('business_id', business.id)
    .select('id, customer_id');

  if (status === 'resolved' && data?.[0]) {
    await emitWebhookEvent(createAdminClient(), business.id, 'feedback.resolved', { feedback_id: data[0].id, customer_id: data[0].customer_id });
  }

  // Revalidate the whole app layout (not just this page) so the unread-count
  // badge on the sidebar's Feedback item updates immediately.
  revalidatePath('/', 'layout');
}

/** Bulk triage: ids are re-validated and scoped to the signed-in business; capped per call. */
export async function bulkUpdateFeedbackStatus(ids: unknown, status: FeedbackStatus): Promise<BulkFeedbackResult> {
  const { business, userId, email } = await requireCapability('customers.write');
  if (!STATUSES.includes(status)) return { ok: false, updated: 0, message: 'Unknown status.' };
  const clean = cleanIds(ids);
  if (clean.length === 0) return { ok: false, updated: 0, message: 'Select at least one message.' };

  const { data, error } = await createClient()
    .from('private_feedback')
    .update({ status })
    .eq('business_id', business.id)
    .in('id', clean)
    .select('id, customer_id');
  if (error) return { ok: false, updated: 0, message: 'Could not update those messages. Please try again.' };

  const updated = data?.length ?? 0;
  if (status === 'resolved') {
    const admin = createAdminClient();
    for (const row of data ?? []) await emitWebhookEvent(admin, business.id, 'feedback.resolved', { feedback_id: row.id, customer_id: row.customer_id });
  }
  await recordAudit({
    action: 'feedback.bulk_updated',
    businessId: business.id,
    actorId: userId,
    actorEmail: email,
    targetType: 'private_feedback',
    metadata: { status, count: updated },
  });
  revalidatePath('/', 'layout');
  return { ok: true, updated, message: `${updated} message${updated === 1 ? '' : 's'} marked ${status}.` };
}
