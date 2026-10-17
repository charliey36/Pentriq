/**
 * Shared engine for owner-triggered ("send now") manual sends.
 *
 * Two surfaces call into here with identical behaviour:
 *   - Server actions   (src/app/(app)/customers/actions.ts) — the UI buttons
 *   - API endpoints    (src/app/api/send-review-request, send-rebooking-reminder)
 *
 * Keeping the logic here (rather than duplicating it in each route/action)
 * means a manual review send and a manual rebooking reminder behave the same
 * no matter who triggered them, and they reuse the exact same send pipeline
 * (channel resolution, consent, demo-aware simulation, retry/error recording)
 * as the scheduled jobs.
 *
 * Manual review request:
 *   - Reuses the review-scheduling engine to produce (or find) a held review
 *     request for the customer, then sends it immediately via sendQueuedReview.
 *   - Duplicate protection is inherited from the engine: if a review is already
 *     queued/pending we send that one rather than creating a second.
 *
 * Manual rebooking reminder:
 *   - Inserts a one-off `rebooking_reminder` message (no journey) and delivers
 *     it immediately through the same channel-agnostic path, recording status
 *     on the message row so it shows in message history exactly like a
 *     scheduled reminder.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { resolveChannel, sendMessage } from '@/lib/messaging';
import { renderMessage } from '@/lib/templates';
import { rebookingLink } from '@/lib/booking-url';
import { sendQueuedReview } from '@/lib/review-queue';
import { extractReviewSchedulingLogic, isDuplicateReviewRequest } from '@/lib/review-scheduling';
import { isDemoCustomer, simulateDemoEmailSend } from '@/lib/demo-mode';
import { todayIso } from '@/lib/eligibility';
import { senderDisplayName, getAppUrl } from '@/lib/brand';
import { sendBlockedReason } from '@/lib/billing';

type Db = SupabaseClient<Database>;

export type ManualSendResult = { ok: boolean; error?: string; messageId?: string };

/**
 * Send a review request to a customer right now.
 *
 * Finds the customer's existing queued/pending review request (so we never
 * create a duplicate) or creates a fresh held one via the shared scheduling
 * engine, then delivers it immediately. Window checks are intentionally
 * skipped: this is an explicit owner action for a specific customer, so the
 * owner's judgement overrides the automatic review-window gate — unsubscribe
 * consent is still enforced inside sendQueuedReview.
 */
export async function sendManualReviewRequestFor(
  supabase: Db,
  businessId: string,
  customerId: string
): Promise<ManualSendResult> {
  const { data: customer } = await supabase
    .from('customers')
    .select('id, unsubscribed_at')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!customer) return { ok: false, error: 'Customer not found.' };
  if (customer.unsubscribed_at) return { ok: false, error: 'This customer has unsubscribed.' };

  // Reuse any review request already waiting for this customer so we don't
  // create a second one; otherwise create a held request via the engine.
  let messageId: string | null = null;
  const { data: existing } = await supabase
    .from('messages')
    .select('id')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('purpose', 'review_request')
    .in('status', ['queued', 'pending'])
    .order('created_at')
    .limit(1);

  if (existing && existing.length > 0) {
    messageId = existing[0].id;
  } else {
    const outcome = await extractReviewSchedulingLogic(supabase, businessId, customerId, {
      serviceDate: todayIso(),
      autoSend: false, // held, so we can send it immediately below
      // no windowDays: explicit manual send overrides the automatic window gate
      unsubscribedAt: customer.unsubscribed_at,
    });
    if (!outcome.scheduled) {
      // Only remaining non-error reason here is a race where a duplicate
      // appeared; re-read it so we can still send one.
      if (outcome.reason === 'duplicate') {
        const dup = await isDuplicateReviewRequest(supabase, businessId, customerId);
        if (dup) {
          const { data: again } = await supabase
            .from('messages')
            .select('id')
            .eq('business_id', businessId)
            .eq('customer_id', customerId)
            .eq('purpose', 'review_request')
            .in('status', ['queued', 'pending'])
            .order('created_at')
            .limit(1);
          messageId = again?.[0]?.id ?? null;
        }
      }
      if (!messageId) {
        return { ok: false, error: outcome.error ?? 'Could not create a review request.' };
      }
    } else {
      messageId = outcome.messageId;
    }
  }

  if (!messageId) return { ok: false, error: 'Could not create a review request.' };

  const res = await sendQueuedReview(supabase, businessId, messageId);
  return { ok: res.ok, error: res.error, messageId };
}

/**
 * Send a rebooking reminder to a customer right now.
 *
 * Inserts a one-off `rebooking_reminder` message (not tied to a journey) and
 * delivers it immediately via the same channel-agnostic pipeline the daily
 * reminder job uses, so it appears in message history identically. Demo /
 * sandbox customers are simulated (never actually delivered) so demos stay
 * clean. On failure the message row records the error and stays visible.
 */
export async function sendManualRebookingReminderFor(
  supabase: Db,
  businessId: string,
  customerId: string
): Promise<ManualSendResult> {
  const [{ data: customer }, { data: business }] = await Promise.all([
    supabase.from('customers').select('*').eq('id', customerId).eq('business_id', businessId).maybeSingle(),
    supabase.from('businesses').select('*').eq('id', businessId).maybeSingle(),
  ]);

  if (!customer) return { ok: false, error: 'Customer not found.' };
  if (!business) return { ok: false, error: 'Business not found.' };
  const blocked = sendBlockedReason(business);
  if (blocked) return { ok: false, error: blocked };
  if (customer.unsubscribed_at && customer.unsubscribed_sms_at) {
    return { ok: false, error: 'This customer has opted out of all messages.' };
  }

  const channel = resolveChannel('email', customer);
  if (!channel) return { ok: false, error: `${customer.name} is not reachable on any channel.` };

  // Create the message row up front so a failed send is still recorded in
  // history (mirrors how the scheduled jobs persist a row then send).
  const { data: message, error: insertError } = await supabase
    .from('messages')
    .insert({
      business_id: businessId,
      customer_id: customerId,
      purpose: 'rebooking_reminder',
      channel,
      status: 'queued',
      send_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError || !message) {
    return { ok: false, error: `Failed to create reminder: ${insertError?.message ?? 'unknown error'}` };
  }

  const appUrl = getAppUrl();

  try {
    const rendered = renderMessage('rebooking_reminder', channel, {
      businessName: business.name,
      customerName: customer.name,
      rebookingUrl: rebookingLink(business, customer.id, appUrl),
      unsubscribeUrl: `${appUrl}/api/unsubscribe/${customer.id}`,
    });

    if (isDemoCustomer(customer)) {
      await simulateDemoEmailSend({ email: customer.email, subject: rendered.subject, messageId: message.id });
    } else {
      await sendMessage(
        {
          channel,
          to: { email: customer.email, phone: customer.phone ?? undefined },
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          listUnsubscribeUrl: `${appUrl}/api/unsubscribe/${customer.id}`,
        },
        senderDisplayName(business.name)
      );
    }

    await supabase
      .from('messages')
      .update({ status: 'sent', sent_at: new Date().toISOString(), channel, last_error: null })
      .eq('id', message.id);

    return { ok: true, messageId: message.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Send failed.';
    await supabase.from('messages').update({ last_error: error }).eq('id', message.id);
    return { ok: false, error, messageId: message.id };
  }
}
