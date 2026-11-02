'use server';

import { userSafeError } from '@/lib/log';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/business-access';
import { recordAudit } from '@/lib/audit';
import { computeCustomerMetrics, filterMetrics, loadSegmentInputs, validateConditions } from '@/lib/segments';
import { sendManualRebookingReminderFor, sendManualReviewRequestFor } from '@/lib/manual-sends';

export type SegmentFormResult = { error?: string; success?: boolean };
export type CampaignResult = { ok: boolean; message: string; sent: number; failed: number; skipped: number };

/** Per click; larger audiences are sent in batches so a single request never runs long. */
const CAMPAIGN_LIMIT = 25;
const CONCURRENCY = 5;

function parseConditions(formData: FormData) {
  const json = formData.get('conditions');
  if (typeof json === 'string' && json.trim()) {
    try {
      return validateConditions(JSON.parse(json));
    } catch {
      return { ok: false as const, error: 'Invalid conditions.' };
    }
  }
  // Single-condition form (older clients).
  return validateConditions([{ field: formData.get('field'), operator: formData.get('operator'), value: formData.get('value') }]);
}

export async function createSegment(_prev: SegmentFormResult, formData: FormData): Promise<SegmentFormResult> {
  const { business } = await requireCapability('customers.write');
  const supabase = createClient();

  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  if (!name) return { error: 'Segment name is required.' };
  const parsed = parseConditions(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.from('segments').insert({
    business_id: business.id,
    name,
    rule_definition: parsed.conditions,
  });

  if (error) {
    return { error: userSafeError('Failed to create segment', error) };
  }

  revalidatePath('/segments');
  return { success: true };
}

export async function deleteSegment(segmentId: string) {
  const { business } = await requireCapability('customers.write');
  const supabase = createClient();

  await supabase.from('segments').delete().eq('id', segmentId).eq('business_id', business.id);
  revalidatePath('/segments');
}

/**
 * Send to everyone in a segment: a rebooking reminder or a review request. The audience is re-evaluated on
 * the server from the rules (never trusted from the browser), unsubscribed customers are skipped, and each
 * send goes through the same pipeline (consent, billing, channel, retries) as a one-off manual send.
 * At most CAMPAIGN_LIMIT customers per call, oldest-lapsed first; the result says how many remain.
 */
export async function sendSegmentCampaign(rulesJson: string, kind: 'rebooking' | 'review'): Promise<CampaignResult> {
  const { business, userId, email } = await requireCapability('customers.write');
  if (kind !== 'rebooking' && kind !== 'review') return { ok: false, message: 'Unknown campaign type.', sent: 0, failed: 0, skipped: 0 };

  let parsed;
  try {
    parsed = validateConditions(JSON.parse(rulesJson));
  } catch {
    return { ok: false, message: 'Invalid segment rules.', sent: 0, failed: 0, skipped: 0 };
  }
  if (!parsed.ok) return { ok: false, message: parsed.error, sent: 0, failed: 0, skipped: 0 };

  const supabase = createClient();
  const inputs = await loadSegmentInputs(supabase, business.id);
  const members = filterMetrics(computeCustomerMetrics(inputs), parsed.conditions);
  const reachable = members
    .filter((m) => m.subscribed)
    .sort((a, b) => (b.daysSinceLastVisit ?? -1) - (a.daysSinceLastVisit ?? -1));
  const batch = reachable.slice(0, CAMPAIGN_LIMIT);
  const skipped = members.length - reachable.length;

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const results = await Promise.all(
      batch.slice(i, i + CONCURRENCY).map((m) =>
        (kind === 'rebooking'
          ? sendManualRebookingReminderFor(supabase, business.id, m.customer.id)
          : sendManualReviewRequestFor(supabase, business.id, m.customer.id)
        ).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : 'Send failed' }))
      )
    );
    for (const r of results) {
      if (r.ok) sent += 1;
      else {
        failed += 1;
        firstError ??= r.error;
      }
    }
    // Billing or configuration problems fail every send identically: stop instead of hammering.
    if (sent === 0 && failed > 0 && i === 0 && firstError && /subscription|trial|review link|google/i.test(firstError)) break;
  }

  await recordAudit({
    action: 'segment.campaign_sent',
    businessId: business.id,
    actorId: userId,
    actorEmail: email,
    targetType: 'segment',
    metadata: { kind, sent, failed, skipped, audience: members.length },
  });
  revalidatePath('/segments');
  revalidatePath('/activity');

  const remaining = Math.max(0, reachable.length - batch.length);
  const label = kind === 'rebooking' ? 'rebooking reminder' : 'review request';
  const parts = [`${sent} ${label}${sent === 1 ? '' : 's'} sent`];
  if (failed) parts.push(`${failed} failed${firstError ? ` (${firstError})` : ''}`);
  if (skipped) parts.push(`${skipped} unsubscribed skipped`);
  if (remaining) parts.push(`${remaining} more to send: run it again`);
  return { ok: sent > 0 || failed === 0, message: `${parts.join(', ')}.`, sent, failed, skipped };
}
