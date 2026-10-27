'use server';

import { userSafeError } from '@/lib/log';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import { todayIso } from '@/lib/eligibility';
import { extractReviewSchedulingLogic } from '@/lib/review-scheduling';
import { cooldownDaysFor } from '@/lib/eligibility';
import { sendManualReviewRequestFor, sendManualRebookingReminderFor } from '@/lib/manual-sends';

export type LogVisitResult = { error?: string; success?: boolean };

export async function logVisit(
  customerId: string,
  _prev: LogVisitResult,
  formData: FormData
): Promise<LogVisitResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const serviceId = String(formData.get('service_id') ?? '').trim() || null;
  const priceRaw = String(formData.get('price') ?? '').trim();
  const price = priceRaw ? Number(priceRaw) : null;
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const staffName = String(formData.get('staff_name') ?? '').trim().slice(0, 120) || null;

  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1_000_000)) {
    return { error: 'Price must be a number between 0 and 1,000,000.' };
  }
  if (notes && notes.length > 1000) return { error: 'Notes must be 1,000 characters or fewer.' };

  // The customer and service must belong to this business (ids come from the browser).
  const { data: ownedCustomer } = await supabase.from('customers').select('id').eq('id', customerId).eq('business_id', business.id).maybeSingle();
  if (!ownedCustomer) return { error: 'Customer not found.' };
  if (serviceId) {
    const { data: ownedService } = await supabase.from('services').select('id').eq('id', serviceId).eq('business_id', business.id).maybeSingle();
    if (!ownedService) return { error: 'Service not found.' };
  }

  const { data: visit, error } = await supabase
    .from('visits')
    .insert({
      business_id: business.id,
      customer_id: customerId,
      service_id: serviceId,
      price,
      notes,
      ...(staffName ? { staff_name: staffName } : {}),
    })
    .select('id')
    .single();

  if (error || !visit) {
    return { error: userSafeError('Could not log the visit', error ?? 'no row returned') };
  }

  // A logged visit is a completed service — keep last_service_date in step so
  // rebooking/review timing is based on the real most-recent service.
  const serviceDate = todayIso();
  await supabase
    .from('customers')
    .update({ last_service_date: serviceDate })
    .eq('id', customerId)
    .eq('business_id', business.id);

  // Award loyalty points for the visit if the program is active.
  const { data: program } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('business_id', business.id)
    .eq('is_active', true)
    .maybeSingle();

  if (program) {
    await supabase.from('loyalty_ledger_entries').insert({
      business_id: business.id,
      customer_id: customerId,
      delta: program.points_per_visit,
      reason: 'visit',
    });
  }

  // Auto-schedule a review request using the same engine CSV import uses.
  // Held by default (owner presses Send); duplicate protection is enforced
  // inside the engine (per-customer and per-visit).
  const { data: customer } = await supabase
    .from('customers')
    .select('unsubscribed_at')
    .eq('id', customerId)
    .eq('business_id', business.id)
    .maybeSingle();

  await extractReviewSchedulingLogic(supabase, business.id, customerId, {
    visitId: visit.id,
    serviceDate,
    autoSend: false,
    windowDays: business.review_request_window_days,
    cooldownDays: cooldownDaysFor(business),
    unsubscribedAt: customer?.unsubscribed_at ?? null,
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath('/customers');
  return { success: true };
}

export async function addCustomerTag(customerId: string, tag: string) {
  const business = await requireBusiness();
  const supabase = createClient();

  const cleaned = tag.trim().toLowerCase();
  if (!cleaned) return;

  await supabase
    .from('customer_tags')
    .insert({ business_id: business.id, customer_id: customerId, tag: cleaned })
    .select()
    .maybeSingle();

  revalidatePath(`/customers/${customerId}`);
}

export async function removeCustomerTag(tagId: string, customerId: string) {
  const business = await requireBusiness();
  const supabase = createClient();

  await supabase.from('customer_tags').delete().eq('id', tagId).eq('business_id', business.id);

  revalidatePath(`/customers/${customerId}`);
}

export type ManualActionResult = { error?: string; success?: boolean; message?: string };

/**
 * Admin-only: reset the customer's last service date to today. Deliberately
 * does NOT create a visit, award points or schedule any message — use
 * `logVisit` for that.
 */
export async function resetServiceDate(customerId: string): Promise<ManualActionResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const { error } = await supabase
    .from('customers')
    .update({ last_service_date: todayIso() })
    .eq('id', customerId)
    .eq('business_id', business.id);
  if (error) return { error: error.message };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath('/customers');
  return { success: true, message: 'Service date reset to today.' };
}

/** Owner-triggered: send a review request to this customer right now. */
export async function sendManualReviewRequest(customerId: string): Promise<ManualActionResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const res = await sendManualReviewRequestFor(supabase, business.id, customerId);

  revalidatePath(`/customers/${customerId}`);
  revalidatePath('/customers');
  revalidatePath('/dashboard');

  if (!res.ok) return { error: res.error ?? 'Could not send the review request.' };
  return { success: true, message: 'Review request sent.' };
}

/** Owner-triggered: send a rebooking reminder to this customer right now. */
export async function sendManualRebookingReminder(customerId: string): Promise<ManualActionResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const res = await sendManualRebookingReminderFor(supabase, business.id, customerId);

  revalidatePath(`/customers/${customerId}`);
  revalidatePath('/customers');

  if (!res.ok) return { error: res.error ?? 'Could not send the rebooking reminder.' };
  return { success: true, message: 'Rebooking reminder sent.' };
}

/**
 * Soft-archive this customer: hides them from the active list and cancels any
 * still-queued/pending sends, without destroying their history. Reversible via
 * `unarchiveCustomer`.
 */
export async function archiveCustomer(customerId: string): Promise<ManualActionResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const { error } = await supabase
    .from('customers')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', customerId)
    .eq('business_id', business.id);

  if (error) return { error: userSafeError('Failed to archive customer', error) };

  // Stop anything still waiting to go out — an archived customer shouldn't
  // receive further automated messages.
  await supabase
    .from('messages')
    .update({ status: 'cancelled' })
    .eq('business_id', business.id)
    .eq('customer_id', customerId)
    .in('status', ['queued', 'pending']);

  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  return { success: true, message: 'Customer archived.' };
}

/** Restore a previously archived customer back to the active list. */
export async function unarchiveCustomer(customerId: string): Promise<ManualActionResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const { error } = await supabase
    .from('customers')
    .update({ archived_at: null })
    .eq('id', customerId)
    .eq('business_id', business.id);

  if (error) return { error: userSafeError('Failed to restore customer', error) };

  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  return { success: true, message: 'Customer restored.' };
}

/** Edit a customer's core contact details (name / email / phone). */
export async function editCustomer(
  customerId: string,
  _prev: ManualActionResult,
  formData: FormData
): Promise<ManualActionResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phoneRaw = String(formData.get('phone') ?? '').trim();

  if (!name) return { error: 'Customer name is required.' };

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) return { error: 'Enter a valid email address.' };

  const { error } = await supabase
    .from('customers')
    .update({ name, email, phone: phoneRaw || null })
    .eq('id', customerId)
    .eq('business_id', business.id);

  if (error) return { error: userSafeError('Failed to update customer', error) };

  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  return { success: true, message: 'Customer updated.' };
}
