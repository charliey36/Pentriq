import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMessage, resolveChannel } from '@/lib/messaging';
import { renderMessage } from '@/lib/templates';
import { rebookingLink } from '@/lib/booking-url';
import { advanceJourneyEnrollment } from '@/lib/journeys';
import { senderDisplayName, getAppUrl } from '@/lib/brand';
import { buildTrackingUrl } from '@/lib/click-tracking';
import { sendBlockedReason } from '@/lib/billing';
import { reviewLinkBlockedReason, REVIEW_LINK_RETRY_MS } from '@/lib/send-guards';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

const BACKOFF_MINUTES_BY_ATTEMPT: Record<number, number> = {
  1: 5,
  2: 30,
  3: 120,
  4: 360,
};
const DEFAULT_BACKOFF_MINUTES = 720;

function backoffMinutesFor(attempt: number) {
  return BACKOFF_MINUTES_BY_ATTEMPT[attempt] ?? DEFAULT_BACKOFF_MINUTES;
}

/**
 * Scheduled job: processes due rows in the generalized `messages` table —
 * review sequence follow-ups, rebooking reminders, win-back, birthday,
 * referral, and loyalty messages — rendering the right template per
 * purpose/channel, resolving the best available channel for the customer,
 * sending via the channel-agnostic messaging abstraction, and advancing
 * the owning journey enrollment on success.
 *
 * This runs alongside (not instead of) /api/send-review-requests, which
 * continues to own the original single-send review_requests flow and its
 * dashboard counters unchanged. Protected by the same CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: 'Server misconfigured: CRON_SECRET is not set.' },
      { status: 500 }
    );
  }

  if (!isCronAuthorized(request, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: dueMessages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', nowIso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .limit(50);

  if (error) {
    captureError(error, { area: 'cron:send-messages' });
    return NextResponse.json({ error: `Failed to load due messages: ${error.message}` }, { status: 500 });
  }

  if (!dueMessages || dueMessages.length === 0) {
    return NextResponse.json({ sent: 0, retried: 0, failed: 0, skipped: 0, message: 'No due messages.' });
  }

  const appUrl = getAppUrl();

  let sent = 0;
  let retried = 0;
  let failed = 0;
  let skipped = 0;
  const ownerEmailCache = new Map<string, string | null>();

  for (const message of dueMessages) {
    try {
      const [{ data: customer }, { data: business }] = await Promise.all([
        supabase.from('customers').select('*').eq('id', message.customer_id).single(),
        supabase.from('businesses').select('*').eq('id', message.business_id).single(),
      ]);

      if (!customer || !business) {
        throw new Error('Customer or business record not found.');
      }

      let ownerEmail: string | null;
      if (ownerEmailCache.has(business.owner_id)) {
        ownerEmail = ownerEmailCache.get(business.owner_id) ?? null;
      } else {
        ownerEmail = (await supabase.auth.admin.getUserById(business.owner_id)).data.user?.email ?? null;
        ownerEmailCache.set(business.owner_id, ownerEmail);
      }

      // Subscription required: leave the row pending and look again tomorrow,
      // so it neither fails nor starves other businesses' rows in the batch.
      if (sendBlockedReason(business, new Date(), ownerEmail ?? undefined)) {
        await supabase
          .from('messages')
          .update({ next_attempt_at: new Date(Date.now() + 86_400_000).toISOString() })
          .eq('id', message.id);
        skipped += 1;
        continue;
      }

      // Review link not set up yet: hold review requests (not the other message types) and
      // check again soon, so they go out shortly after the owner adds the link.
      if (reviewLinkBlockedReason(business, message.purpose)) {
        await supabase
          .from('messages')
          .update({ next_attempt_at: new Date(Date.now() + REVIEW_LINK_RETRY_MS).toISOString() })
          .eq('id', message.id);
        skipped += 1;
        continue;
      }

      const channel = resolveChannel(message.channel, customer);

      if (!channel) {
        // No usable channel (unsubscribed from everything, or missing
        // contact info) — cancel rather than endlessly retry.
        await supabase.from('messages').update({ status: 'cancelled' }).eq('id', message.id);
        if (message.journey_enrollment_id) {
          await supabase
            .from('journey_enrollments')
            .update({ status: 'exited' })
            .eq('id', message.journey_enrollment_id);
        }
        skipped += 1;
        continue;
      }

      const unsubscribeUrl = `${appUrl}/api/unsubscribe/${customer.id}`;
      const privateFeedbackUrl = `${appUrl}/feedback/${message.id}`;
      const trackingUrl = business.google_review_url
        ? buildTrackingUrl(appUrl, message, { source: 'send-messages', kind: 'message' })
        : undefined;

      const rendered = renderMessage(message.purpose, channel, {
        businessName: business.name,
        customerName: customer.name,
        publicReviewUrl: trackingUrl,
        privateFeedbackUrl,
        unsubscribeUrl,
        rebookingUrl: rebookingLink(business, customer.id, appUrl),
      });

      await sendMessage(
        {
          channel,
          to: { email: customer.email, phone: customer.phone ?? undefined },
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          listUnsubscribeUrl: unsubscribeUrl,
        },
        senderDisplayName(business.name)
      );

      await supabase
        .from('messages')
        .update({ status: 'sent', sent_at: new Date().toISOString(), channel })
        .eq('id', message.id);

      if (message.journey_enrollment_id) {
        await advanceJourneyEnrollment(supabase, message.journey_enrollment_id);
      }

      sent += 1;
    } catch (err) {
      captureError(err, { area: 'cron:send-messages', tags: { message_id: message.id, business_id: message.business_id, purpose: message.purpose } });
      const errMessage = err instanceof Error ? err.message : 'Unknown error';
      const nextAttempt = message.attempts + 1;

      if (nextAttempt >= message.max_attempts) {
        await supabase
          .from('messages')
          .update({ status: 'failed', attempts: nextAttempt, last_error: errMessage })
          .eq('id', message.id);
        failed += 1;
      } else {
        const backoffMs = backoffMinutesFor(nextAttempt) * 60 * 1000;
        await supabase
          .from('messages')
          .update({
            attempts: nextAttempt,
            next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
            last_error: errMessage,
          })
          .eq('id', message.id);
        retried += 1;
      }
    }
  }

  return NextResponse.json({ sent, retried, failed, skipped });
}
