/**
 * Core review-scheduling engine.
 *
 * This is the single, reusable path for turning a completed service visit
 * into a scheduled (or held) review request. It is shared by:
 *   - CSV import            (src/lib/customers.ts, batch path)
 *   - Manual visit logging  (src/app/(app)/customers/[customerId]/actions.ts)
 *   - Manual review sends   (owner-triggered "request a review now")
 *
 * The behaviour is deliberately identical to the CSV import flow so there is
 * one definition of "how a review gets scheduled":
 *   - `autoSend = false` (the default) inserts a HELD message
 *     (status 'queued', send_at = now) that waits in the Customers list until
 *     the owner presses Send. No journey enrollment.
 *   - `autoSend = true` enrolls the customer in the active `review_sequence`
 *     journey (initial request + day-3 / day-7 reminders) with the first
 *     send at 08:00 UK the day after the service, or inserts a bare
 *     pending message if no active journey exists.
 *
 * Duplicate protection is enforced in two layers:
 *   1. `isDuplicateReviewRequest()` — never queue a second review request for
 *      a customer who already has one queued/pending (matches CSV + the
 *      legacy `scheduleReviewRequest`).
 *   2. Optional `visitId` guard — if a review already exists for this exact
 *      visit, we don't create another, so re-running against the same visit
 *      is safe.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { reviewSendTime } from '@/lib/send-window';
import { daysSinceService, isCooldownActive, todayIso } from '@/lib/eligibility';
import { enrollCustomerInJourney } from '@/lib/journeys';

type Db = SupabaseClient<Database>;

export type ReviewSchedulingOutcome =
  | { scheduled: true; mode: 'held' | 'journey' | 'bare'; messageId: string | null }
  | { scheduled: false; reason: 'duplicate' | 'unsubscribed' | 'outside_window' | 'cooldown' | 'error'; error?: string };

export type ScheduleReviewOptions = {
  /** The visit that triggered this review, if any. Enables per-visit dedupe + attribution. */
  visitId?: string | null;
  /** Service date (YYYY-MM-DD) the review timing is based on. Defaults to today. */
  serviceDate?: string;
  /** When true, enroll in the review_sequence journey; otherwise hold for manual send. */
  autoSend?: boolean;
  /**
   * Review request window in days. When provided, services older than this are
   * not scheduled (matches CSV import). Omit to skip the window check (e.g. an
   * explicit manual "send now" the owner has chosen regardless of age).
   */
  windowDays?: number;
  /**
   * Review request cooldown in days (null/omitted = off). When set, nothing is
   * scheduled if the customer's last SENT review request is more recent than this.
   * Explicit manual sends leave it unset.
   */
  cooldownDays?: number | null;
  /** Set when the customer is unsubscribed, to short-circuit scheduling. */
  unsubscribedAt?: string | null;
};

/**
 * Returns true if the customer already has a review request that is queued or
 * pending — optionally scoped to a specific visit. This is the shared dedupe
 * check used before creating any new review request.
 */
export async function isDuplicateReviewRequest(
  supabase: Db,
  businessId: string,
  customerId: string,
  visitId?: string | null
): Promise<boolean> {
  let query = supabase
    .from('messages')
    .select('id')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('purpose', 'review_request')
    .in('status', ['queued', 'pending']);

  // If we know the visit, treat an existing review for the SAME visit as the
  // duplicate. Otherwise fall back to "any active review for this customer".
  if (visitId) query = query.eq('visit_id', visitId);

  const { data } = await query.limit(1);
  return !!data && data.length > 0;
}

/** When the customer's most recent review request was actually sent (null if never). */
export async function lastReviewRequestSentAt(supabase: Db, businessId: string, customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('messages')
    .select('sent_at')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('purpose', 'review_request')
    .eq('status', 'sent')
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1);
  return data?.[0]?.sent_at ?? null;
}

/**
 * Creates the actual review request message for a completed visit, either as a
 * held/queued message (manual send later) or by enrolling the customer in the
 * active review_sequence journey (auto-send). Assumes dedupe/eligibility have
 * already been checked by the caller (use `extractReviewSchedulingLogic` for
 * the full guarded path). Returns the created message id when one is inserted
 * directly (held / bare); journey enrollment returns null (the journey engine
 * owns that message).
 */
export async function createReviewRequestFromVisit(
  supabase: Db,
  businessId: string,
  customerId: string,
  options: ScheduleReviewOptions = {}
): Promise<ReviewSchedulingOutcome> {
  const serviceDate = options.serviceDate ?? todayIso();
  const visitId = options.visitId ?? null;

  // Auto-send: enroll in the review_sequence journey (request + reminders).
  if (options.autoSend) {
    const { data: journey } = await supabase
      .from('journeys')
      .select('*')
      .eq('business_id', businessId)
      .eq('key', 'review_sequence')
      .eq('is_active', true)
      .maybeSingle();

    const sendAt = reviewSendTime(serviceDate);

    if (journey) {
      await enrollCustomerInJourney(supabase, journey, customerId, sendAt);
      return { scheduled: true, mode: 'journey', messageId: null };
    }

    // No journey configured: insert a bare pending request at the send time.
    const { data, error } = await supabase
      .from('messages')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        purpose: 'review_request',
        channel: 'email',
        status: 'pending',
        send_at: sendAt.toISOString(),
        visit_id: visitId,
      })
      .select('id')
      .single();
    if (error) return { scheduled: false, reason: 'error', error: error.message };
    return { scheduled: true, mode: 'bare', messageId: data?.id ?? null };
  }

  // Held: waits in the Customers list until the owner presses Send.
  const { data, error } = await supabase
    .from('messages')
    .insert({
      business_id: businessId,
      customer_id: customerId,
      purpose: 'review_request',
      channel: 'email',
      status: 'queued',
      send_at: new Date().toISOString(),
      visit_id: visitId,
    })
    .select('id')
    .single();
  if (error) return { scheduled: false, reason: 'error', error: error.message };
  return { scheduled: true, mode: 'held', messageId: data?.id ?? null };
}

/**
 * The full, guarded review-scheduling path — the reusable "extract" of what
 * CSV import does per customer, now callable from manual visit logging and
 * manual review sends. It:
 *   1. skips unsubscribed customers,
 *   2. optionally skips services outside the review window,
 *   3. skips when a duplicate review already exists (customer- or visit-scoped),
 *   4. otherwise creates the review request (held or journey) via
 *      `createReviewRequestFromVisit`.
 *
 * Returns a structured outcome so callers can surface why nothing was
 * scheduled without throwing.
 */
export async function extractReviewSchedulingLogic(
  supabase: Db,
  businessId: string,
  customerId: string,
  options: ScheduleReviewOptions = {}
): Promise<ReviewSchedulingOutcome> {
  const serviceDate = options.serviceDate ?? todayIso();

  if (options.unsubscribedAt) {
    return { scheduled: false, reason: 'unsubscribed' };
  }

  if (typeof options.windowDays === 'number') {
    const days = daysSinceService(serviceDate);
    if (days === null || days < 0 || days > options.windowDays) {
      return { scheduled: false, reason: 'outside_window' };
    }
  }

  if (options.cooldownDays) {
    const lastSent = await lastReviewRequestSentAt(supabase, businessId, customerId);
    if (isCooldownActive(lastSent, options.cooldownDays, serviceDate)) {
      return { scheduled: false, reason: 'cooldown' };
    }
  }

  const duplicate = await isDuplicateReviewRequest(supabase, businessId, customerId, options.visitId ?? null);
  if (duplicate) {
    return { scheduled: false, reason: 'duplicate' };
  }

  return createReviewRequestFromVisit(supabase, businessId, customerId, { ...options, serviceDate });
}
