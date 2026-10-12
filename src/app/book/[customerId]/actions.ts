'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { RATE_LIMITS, requesterId, withinLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';

export type RequestRebookingResult = { error?: string; success?: boolean };

/**
 * Lightweight "request to rebook" flow. Full one-click booking (B3 in the
 * spec) requires either a native slot-availability engine or an
 * integration with the business's existing calendar/scheduling tool — an
 * explicit build-vs-integrate decision called out in the spec as needing
 * validation with real customers before committing engineering effort.
 * Rather than fake real-time availability, this captures the customer's
 * rebooking intent as private feedback-style note so the business can
 * follow up and confirm manually, which is honest about what's actually
 * implemented today.
 */
export async function requestRebooking(
  customerId: string,
  _prev: RequestRebookingResult,
  formData: FormData
): Promise<RequestRebookingResult> {
  const preferredTime = String(formData.get('preferred_time') ?? '').trim().slice(0, 500);

  const ip = requesterId(headers());
  if (
    !(await withinLimit('booking-ip', ip, RATE_LIMITS.bookingIp)) ||
    !(await withinLimit('booking-target', customerId, RATE_LIMITS.bookingTarget))
  ) {
    return { error: 'Too many requests. Please try again later.' };
  }

  const supabase = createAdminClient();

  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_id')
    .eq('id', customerId)
    .maybeSingle();

  if (!customer) {
    return { error: 'This booking link is no longer valid.' };
  }

  const { error } = await supabase.from('private_feedback').insert({
    business_id: customer.business_id,
    customer_id: customer.id,
    comment: `Rebooking request. Preferred time: ${preferredTime || 'not specified'}`,
  });

  if (error) {
    return { error: `Failed to send your request: ${error.message}` };
  }

  return { success: true };
}
