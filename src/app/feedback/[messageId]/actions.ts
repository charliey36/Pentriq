'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { exitJourneyEnrollment } from '@/lib/journeys';
import { RATE_LIMITS, requesterId, withinLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';

export type SubmitFeedbackResult = { error?: string; success?: boolean };

/**
 * Public submission action for the private feedback form linked from every
 * review request message. Unauthenticated by design (same pattern as the
 * click-tracking/unsubscribe endpoints) — uses the admin client since the
 * submitting customer has no Supabase session.
 */
export async function submitPrivateFeedback(
  messageId: string,
  _prev: SubmitFeedbackResult,
  formData: FormData
): Promise<SubmitFeedbackResult> {
  const comment = String(formData.get('comment') ?? '').trim();
  const ratingRaw = String(formData.get('rating') ?? '').trim();
  const rating = ratingRaw ? Number(ratingRaw) : null;

  if (!comment) {
    return { error: 'Please enter your feedback before submitting.' };
  }

  if (comment.length > 5000) {
    return { error: 'Feedback is too long (max 5000 characters).' };
  }

  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { error: 'Invalid rating.' };
  }

  if (
    !(await withinLimit('feedback-ip', requesterId(headers()), RATE_LIMITS.feedbackIp)) ||
    !(await withinLimit('feedback-target', messageId, RATE_LIMITS.feedbackTarget))
  ) {
    return { error: 'Too many submissions. Please try again later.' };
  }

  const supabase = createAdminClient();

  const { data: message } = await supabase
    .from('messages')
    .select('id, business_id, customer_id, journey_enrollment_id')
    .eq('id', messageId)
    .maybeSingle();

  if (!message) {
    return { error: 'This feedback link is no longer valid.' };
  }

  const { error: insertError } = await supabase.from('private_feedback').insert({
    business_id: message.business_id,
    customer_id: message.customer_id,
    message_id: message.id,
    rating,
    comment,
  });

  if (insertError) {
    return { error: `Failed to submit feedback: ${insertError.message}` };
  }

  await supabase.from('interaction_events').insert({
    business_id: message.business_id,
    message_id: message.id,
    customer_id: message.customer_id,
    event_type: 'feedback_submitted',
  });

  if (message.journey_enrollment_id) {
    await exitJourneyEnrollment(supabase, message.journey_enrollment_id);
  }

  return { success: true };
}
