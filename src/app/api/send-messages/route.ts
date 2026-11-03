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
import { loadPersonalisation, reminderDisabled } from '@/lib/review-personalisation';
import { claimDue, dueFilter, MAX_BATCHES_PER_RUN, releaseClaims, runBudget, SEND_BATCH_SIZE, sendIdempotencyKey } from '@/lib/send-claim';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';
/** Seconds this function may run (allowed on every Vercel plan). Sending stops well inside it (send-claim.ts). */
export const maxDuration = 60;

type MessageRow = Database['public']['Tables']['messages']['Row'];
type Outcome = 'sent' | 'retried' | 'failed' | 'skipped';

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
 *
 * Rows are claimed before they are sent (src/lib/send-claim.ts), oldest first, in batches until the run's time
 * budget is spent, so overlapping runs never send the same message twice and one run clears more than one batch.
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
  const budget = runBudget();
  const nowIso = new Date(budget.startedAt).toISOString();
  const appUrl = getAppUrl();
  const ownerEmailCache = new Map<string, string | null>();
  const counts: Record<Outcome, number> = { sent: 0, retried: 0, failed: 0, skipped: 0 };
  let claimedElsewhere = 0;
  let released = 0;

  // A failure is recorded only while the row is still pending, so a late error can never overwrite a send
  // that has already been recorded.
  const recordFailure = async (message: MessageRow, err: unknown): Promise<Outcome> => {
    captureError(err, { area: 'cron:send-messages', tags: { message_id: message.id, business_id: message.business_id, purpose: message.purpose } });
    const errMessage = err instanceof Error ? err.message : 'Unknown error';
    const nextAttempt = message.attempts + 1;
    if (nextAttempt >= message.max_attempts) {
      await supabase
        .from('messages')
        .update({ status: 'failed', attempts: nextAttempt, last_error: errMessage })
        .eq('id', message.id)
        .eq('status', 'pending');
      return 'failed';
    }
    const backoffMs = backoffMinutesFor(nextAttempt) * 60 * 1000;
    await supabase
      .from('messages')
      .update({ attempts: nextAttempt, next_attempt_at: new Date(Date.now() + backoffMs).toISOString(), last_error: errMessage })
      .eq('id', message.id)
      .eq('status', 'pending');
    return 'retried';
  };

  const processMessage = async (message: MessageRow): Promise<Outcome> => {
    let channel: ReturnType<typeof resolveChannel>;
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
        return 'skipped';
      }

      // Review link not set up yet: hold review requests (not the other message types) and
      // check again soon, so they go out shortly after the owner adds the link.
      if (reviewLinkBlockedReason(business, message.purpose)) {
        await supabase
          .from('messages')
          .update({ next_attempt_at: new Date(Date.now() + REVIEW_LINK_RETRY_MS).toISOString() })
          .eq('id', message.id);
        return 'skipped';
      }

      // Reminders switched off for this business: cancel instead of sending, and end the sequence.
      if (reminderDisabled(business, message.purpose)) {
        await supabase.from('messages').update({ status: 'cancelled', last_error: 'Reminders turned off' }).eq('id', message.id);
        if (message.journey_enrollment_id) {
          await supabase.from('journey_enrollments').update({ status: 'exited' }).eq('id', message.journey_enrollment_id);
        }
        return 'skipped';
      }

      channel = resolveChannel(message.channel, customer);

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
        return 'skipped';
      }

      const unsubscribeUrl = `${appUrl}/api/unsubscribe/${customer.id}`;
      const privateFeedbackUrl = `${appUrl}/feedback/${message.id}`;
      const trackingUrl = business.google_review_url
        ? buildTrackingUrl(appUrl, message, { source: 'send-messages', kind: 'message' })
        : undefined;

      const rendered = renderMessage(message.purpose, channel, {
        businessName: business.name,
        contactEmail: business.contact_email,
        customerName: customer.name,
        publicReviewUrl: trackingUrl,
        privateFeedbackUrl,
        unsubscribeUrl,
        rebookingUrl: rebookingLink(business, customer.id, appUrl),
        ...(message.purpose === 'review_request' ? await loadPersonalisation(supabase, business, message) : {}),
      });

      await sendMessage(
        {
          channel,
          to: { email: customer.email, phone: customer.phone ?? undefined },
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          replyTo: business.contact_email,
          listUnsubscribeUrl: unsubscribeUrl,
          idempotencyKey: sendIdempotencyKey('messages', message.id, message.attempts),
        },
        senderDisplayName(business.name)
      );
    } catch (err) {
      return recordFailure(message, err);
    }

    // Sent. From here on nothing may count as a failed send: a retry would email the customer again.
    const { error: markError } = await supabase
      .from('messages')
      .update({ status: 'sent', sent_at: new Date().toISOString(), channel })
      .eq('id', message.id);
    if (markError) {
      captureError(markError, { area: 'cron:send-messages', tags: { message_id: message.id, step: 'mark_sent' } });
    }
    if (message.journey_enrollment_id) {
      try {
        await advanceJourneyEnrollment(supabase, message.journey_enrollment_id);
      } catch (err) {
        captureError(err, { area: 'cron:send-messages', tags: { message_id: message.id, step: 'advance_journey' } });
      }
    }
    return 'sent';
  };

  batches: for (let batch = 0; batch < MAX_BATCHES_PER_RUN && !budget.outOfTime(); batch++) {
    const { data: due, error } = await supabase
      .from('messages')
      .select('*')
      .eq('status', 'pending')
      .lte('send_at', nowIso)
      .or(dueFilter(nowIso))
      .order('send_at', { ascending: true })
      .limit(SEND_BATCH_SIZE);

    if (error) {
      captureError(error, { area: 'cron:send-messages' });
      if (batch === 0) return NextResponse.json({ error: `Failed to load due messages: ${error.message}` }, { status: 500 });
      break;
    }
    if (!due || due.length === 0) break;

    const claim = await claimDue(supabase, 'messages', due.map((m) => m.id));
    if (claim.error) {
      captureError(new Error(claim.error), { area: 'cron:send-messages', tags: { step: 'claim' } });
      if (batch === 0) return NextResponse.json({ error: `Failed to claim due messages: ${claim.error}` }, { status: 500 });
      break;
    }
    claimedElsewhere += due.length - claim.ids.size;
    const mine = due.filter((m) => claim.ids.has(m.id));
    // Nothing claimable: another run is working through these rows.
    if (mine.length === 0) break;

    for (let i = 0; i < mine.length; i++) {
      if (budget.outOfTime()) {
        const rest = mine.slice(i).map((m) => m.id);
        const releaseError = await releaseClaims(supabase, 'messages', rest, claim.leaseUntil, nowIso);
        if (releaseError) captureError(new Error(releaseError), { area: 'cron:send-messages', tags: { step: 'release' } });
        released += rest.length;
        break batches;
      }
      counts[await processMessage(mine[i])] += 1;
    }
    if (due.length < SEND_BATCH_SIZE) break;
  }

  if (counts.sent + counts.retried + counts.failed + counts.skipped + claimedElsewhere + released === 0) {
    return NextResponse.json({ ...counts, message: 'No due messages.' });
  }
  return NextResponse.json({ ...counts, claimedElsewhere, released });
}
