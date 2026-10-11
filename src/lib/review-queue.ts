import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { advanceJourneyEnrollment } from '@/lib/journeys';
import { renderMessage } from '@/lib/templates';
import { resolveChannel, sendMessage } from '@/lib/messaging';
import { isDemoCustomer, simulateDemoEmailSend } from '@/lib/demo-mode';
import { senderDisplayName, getAppUrl } from '@/lib/brand';
import { buildTrackingUrl } from '@/lib/click-tracking';
import { sendBlockedReason } from '@/lib/billing';

/**
 * Sends one queued review request immediately, using the same compliant
 * template (public review link + private feedback option) as the scheduled
 * sender. On failure the message stays queued with the error recorded so the
 * owner can retry.
 */
export async function sendQueuedReview(
  supabase: SupabaseClient<Database>,
  businessId: string,
  messageId: string
): Promise<{ ok: boolean; error?: string }> {
  console.log(`[Send Review] Starting send for message: ${messageId}`);
  
  const { data: message } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('business_id', businessId)
    .in('status', ['queued', 'pending'])
    .maybeSingle();
  
  if (!message) {
    console.log(`[Send Review] Message not found or already sent: ${messageId}`);
    return { ok: false, error: 'This review request was already sent or cancelled.' };
  }
  
  console.log(`[Send Review] Message found, customer_id: ${message.customer_id}, status: ${message.status}`);

  const [{ data: customer }, { data: business }] = await Promise.all([
    supabase.from('customers').select('*').eq('id', message.customer_id).single(),
    supabase.from('businesses').select('*').eq('id', businessId).single(),
  ]);
  
  if (!customer) {
    console.error(`[Send Review] Customer not found: ${message.customer_id}`);
    return { ok: false, error: 'Customer not found.' };
  }
  
  if (!business) {
    console.error(`[Send Review] Business not found: ${businessId}`);
    return { ok: false, error: 'Business not found.' };
  }
  
  const blocked = sendBlockedReason(business);
  if (blocked) return { ok: false, error: blocked };

  console.log(`[Send Review] Customer found: ${customer.email}, Business: ${business.name}`);

  const channel = resolveChannel('email', customer);
  if (!channel) {
    console.log(`[Send Review] Customer unsubscribed: ${customer.id}`);
    await supabase.from('messages').update({ status: 'cancelled', last_error: 'Customer unsubscribed' }).eq('id', messageId);
    return { ok: false, error: `${customer.name} has unsubscribed.` };
  }

  const appUrl = getAppUrl();
  
  // Check if this is a demo account - if so, simulate the send for polished demo
  const isDemo = isDemoCustomer(customer);
  if (isDemo) {
    console.log(`[Send Review] Demo customer detected: ${customer.email}`);
  }
  
  try {
    console.log(`[Send Review] Rendering message for channel: ${channel}`);
    const rendered = renderMessage('review_request', channel, {
      businessName: business.name,
      customerName: customer.name,
      publicReviewUrl: business.google_review_url ? buildTrackingUrl(appUrl, message, { source: 'review-queue', kind: 'message' }) : undefined,
      privateFeedbackUrl: `${appUrl}/feedback/${message.id}`,
      unsubscribeUrl: `${appUrl}/api/unsubscribe/${customer.id}`,
      rebookingUrl: `${appUrl}/book/${customer.id}`,
    });
    
    console.log(`[Send Review] Message rendered, subject: "${rendered.subject}"`);
    
    if (isDemo) {
      // For demo accounts, simulate the send instead of hitting Resend
      // This makes demos look polished without "failed" errors on test data
      console.log(`[Send Review] Sending to demo customer: ${customer.email}`);
      await simulateDemoEmailSend({
        email: customer.email!,
        subject: rendered.subject,
        messageId,
      });
      console.log(`[Send Review] Demo send simulated, updating message status to sent`);
    } else {
      // For real customers, send via Resend
      console.log(`[Send Review] Sending via Resend to: ${customer.email}`);
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
      console.log(`[Send Review] Resend accepted email, updating message status to sent`);
    }
    
    await supabase
      .from('messages')
      .update({ status: 'sent', sent_at: new Date().toISOString(), channel, last_error: null })
      .eq('id', messageId);
    
    console.log(`[Send Review] Message status updated to sent: ${messageId}`);
    
    if (message.journey_enrollment_id) {
      console.log(`[Send Review] Advancing journey enrollment: ${message.journey_enrollment_id}`);
      await advanceJourneyEnrollment(supabase, message.journey_enrollment_id);
    }
    
    console.log(`[Send Review] ✅ Send complete: ${messageId}`);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Send failed.';
    console.error(`[Send Review] ❌ Send failed: ${error}`, e);
    await supabase.from('messages').update({ last_error: error, attempts: message.attempts + 1 }).eq('id', messageId);
    return { ok: false, error };
  }
}
