'use server';

import { suppressedEmails } from '@/lib/safeguards';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import { sendQueuedReview } from '@/lib/review-queue';
import { exitJourneyEnrollment } from '@/lib/journeys';
import { parseServiceDate } from '@/lib/eligibility';
import { sendManualReviewRequestFor, sendManualRebookingReminderFor } from '@/lib/manual-sends';
import { CONSENT_REQUIRED_MESSAGE, hasConsent } from '@/lib/consent';

export type ManualSendResult = { error?: string; success?: boolean; message?: string };

/**
 * Owner-triggered: send a review request to a customer right now. Thin wrapper
 * over the shared manual-send engine (also used by the customer detail page
 * actions and the POST /api/send-review-request endpoint) so every surface
 * sends identically.
 */
export async function sendManualReviewRequest(customerId: string): Promise<ManualSendResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const res = await sendManualReviewRequestFor(supabase, business.id, customerId);

  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  revalidatePath('/dashboard');

  if (!res.ok) return { error: res.error ?? 'Could not send the review request.' };
  return { success: true, message: 'Review request sent.' };
}

/** Owner-triggered: send a rebooking reminder to a customer right now. */
export async function sendManualRebookingReminder(customerId: string): Promise<ManualSendResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const res = await sendManualRebookingReminderFor(supabase, business.id, customerId);

  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);

  if (!res.ok) return { error: res.error ?? 'Could not send the rebooking reminder.' };
  return { success: true, message: 'Rebooking reminder sent.' };
}

export type AddCustomerResult = { error?: string; success?: boolean };

export async function addCustomer(
  _prev: AddCustomerResult,
  formData: FormData
): Promise<AddCustomerResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!name) {
    return { error: 'Customer name is required.' };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return { error: 'Enter a valid email address.' };
  }

  const rawDate = String(formData.get('last_service_date') ?? '').trim();
  const serviceDate = rawDate ? parseServiceDate(rawDate) : null;
  if (rawDate && !serviceDate) return { error: 'Enter a valid last service date.' };

  if (!hasConsent(formData)) return { error: CONSENT_REQUIRED_MESSAGE };

  // Someone who opted out is never contacted again, even if the owner adds them back.
  const optedOut = (await suppressedEmails(supabase, business.id, [email])).has(email);

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({
      business_id: business.id,
      name,
      email,
      phone: phone || null,
      last_service_date: serviceDate,
      consent_confirmed_at: new Date().toISOString(),
      ...(optedOut ? { unsubscribed_at: new Date().toISOString() } : {}),
    })
    .select('*')
    .single();

  if (customerError || !customer) {
    return { error: `Failed to add customer: ${customerError?.message ?? 'unknown error'}` };
  }

  revalidatePath('/customers');
  revalidatePath('/dashboard');
  return { success: true };
}

const MAX_PER_CLICK = 25; // keeps one click well inside the request time limit

export type ReviewActionResult = { message: string };

/** Send one scheduled/held review request right now, or (no id) the next batch of held ones. */
export async function sendReviewNow(messageId?: string): Promise<ReviewActionResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  let ids: string[];
  if (messageId) {
    ids = [messageId];
  } else {
    const { data } = await supabase
      .from('messages')
      .select('id')
      .eq('business_id', business.id)
      .eq('purpose', 'review_request')
      .eq('status', 'queued')
      .order('created_at')
      .limit(MAX_PER_CLICK);
    ids = (data ?? []).map((m) => m.id);
  }

  let sent = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const res = await sendQueuedReview(supabase, business.id, id);
    if (res.ok) sent += 1;
    else errors.push(res.error ?? 'error');
  }
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  return { message: `Sent ${sent}.${errors.length ? ` ${errors.length} failed: ${errors[0]}` : ''}` };
}

/** Cancel a scheduled/held review request (and its follow-up reminders). */
export async function cancelReview(messageId: string): Promise<ReviewActionResult> {
  const business = await requireBusiness();
  const supabase = createClient();
  const { data: m } = await supabase
    .from('messages')
    .select('journey_enrollment_id')
    .eq('id', messageId)
    .eq('business_id', business.id)
    .maybeSingle();
  await supabase
    .from('messages')
    .update({ status: 'cancelled' })
    .eq('id', messageId)
    .eq('business_id', business.id)
    .in('status', ['queued', 'pending']);
  if (m?.journey_enrollment_id) await exitJourneyEnrollment(supabase, m.journey_enrollment_id);
  revalidatePath('/customers');
  return { message: 'Cancelled.' };
}
