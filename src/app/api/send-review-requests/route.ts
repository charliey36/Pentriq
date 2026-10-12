import { sendBlockedReason } from '@/lib/billing';
import { reviewLinkBlockedReason, REVIEW_LINK_RETRY_MS } from '@/lib/send-guards';
import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyOwner } from '@/lib/notifications';
import { sendReviewRequestEmail } from '@/lib/email';
import { getAppUrl } from '@/lib/brand';
import { buildTrackingUrl } from '@/lib/click-tracking';

export const dynamic = 'force-dynamic';

/**
 * Exponential backoff schedule applied after each failed send attempt,
 * indexed by the *new* attempt count (1st failure -> retry in 5 min, 2nd ->
 * 30 min, 3rd -> 2 hours, 4th -> 6 hours). After the final configured
 * attempt (default max_attempts = 5) the row is marked permanently 'failed'
 * instead of being retried again.
 */
const BACKOFF_MINUTES_BY_ATTEMPT: Record<number, number> = {
  1: 5,
  2: 30,
  3: 120,
  4: 360,
};
const DEFAULT_BACKOFF_MINUTES = 720; // fallback for any attempt beyond the table above

function backoffMinutesFor(attempt: number) {
  return BACKOFF_MINUTES_BY_ATTEMPT[attempt] ?? DEFAULT_BACKOFF_MINUTES;
}

/**
 * Scheduled job endpoint: finds all pending review_requests whose send_at
 * (or, for a previously-failed attempt, next_attempt_at) has passed, sends
 * the email, and marks them sent — or, on failure, schedules a retry with
 * exponential backoff up to max_attempts before giving up permanently.
 *
 * Protected by CRON_SECRET so it can't be triggered by random visitors —
 * pass it as either `?secret=...` or an `Authorization: Bearer ...` header.
 * Configure Vercel Cron (see vercel.json) or any external scheduler to hit
 * this on an interval (e.g. every 5 minutes).
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

  // Due = pending, and either this is the first attempt (send_at has
  // passed, next_attempt_at is still null) or a retry is due
  // (next_attempt_at has passed).
  const { data: dueRequests, error } = await supabase
    .from('review_requests')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', nowIso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: `Failed to load due review requests: ${error.message}` },
      { status: 500 }
    );
  }

  if (!dueRequests || dueRequests.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, retried: 0, message: 'No due review requests.' });
  }

  const appUrl = getAppUrl();

  let sent = 0;
  let retried = 0;
  let failed = 0;
  let skippedUnsubscribed = 0;
  const results: Array<{ id: string; status: 'sent' | 'retrying' | 'failed' | 'skipped'; error?: string }> = [];

  for (const reviewRequest of dueRequests) {
    try {
      const [{ data: customer }, { data: business }] = await Promise.all([
        supabase
          .from('customers')
          .select('name, email, unsubscribed_at')
          .eq('id', reviewRequest.customer_id)
          .single(),
        supabase
          .from('businesses')
          .select('name, subscription_status, trial_ends_at, created_at, google_review_url')
          .eq('id', reviewRequest.business_id)
          .single(),
      ]);

      if (!customer || !business) {
        throw new Error('Customer or business record not found.');
      }

      // Subscription required: defer a day instead of failing or starving the batch.
      if (sendBlockedReason(business)) {
        await supabase
          .from('review_requests')
          .update({ next_attempt_at: new Date(Date.now() + 86_400_000).toISOString() })
          .eq('id', reviewRequest.id);
        results.push({ id: reviewRequest.id, status: 'skipped', error: 'Subscription required' });
        continue;
      }

      // Review link not set up yet: hold the request and check again soon.
      if (reviewLinkBlockedReason(business, 'review_request')) {
        await supabase
          .from('review_requests')
          .update({ next_attempt_at: new Date(Date.now() + REVIEW_LINK_RETRY_MS).toISOString() })
          .eq('id', reviewRequest.id);
        results.push({ id: reviewRequest.id, status: 'skipped', error: 'Review link not set up' });
        continue;
      }

      // Consent check: never send to a customer who has unsubscribed,
      // even if their request was scheduled before they opted out.
      if (customer.unsubscribed_at) {
        await supabase
          .from('review_requests')
          .update({ status: 'cancelled' })
          .eq('id', reviewRequest.id);

        skippedUnsubscribed += 1;
        results.push({ id: reviewRequest.id, status: 'skipped' });
        continue;
      }

      const trackingUrl = buildTrackingUrl(appUrl, reviewRequest, { source: 'send-review-requests', kind: 'review_request' });
      const unsubscribeUrl = `${appUrl}/api/unsubscribe/${reviewRequest.customer_id}`;

      await sendReviewRequestEmail({
        to: customer.email,
        businessName: business.name,
        customerName: customer.name,
        trackingUrl,
        unsubscribeUrl,
      });

      await supabase
        .from('review_requests')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', reviewRequest.id);

      sent += 1;
      await notifyOwner('campaign', reviewRequest.business_id);
      results.push({ id: reviewRequest.id, status: 'sent' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const nextAttempt = reviewRequest.attempts + 1;
      const maxAttempts = reviewRequest.max_attempts;

      if (nextAttempt >= maxAttempts) {
        // Exhausted retries — terminal failure.
        await supabase
          .from('review_requests')
          .update({
            status: 'failed',
            attempts: nextAttempt,
            last_error: message,
          })
          .eq('id', reviewRequest.id);

        failed += 1;
        results.push({ id: reviewRequest.id, status: 'failed', error: message });
      } else {
        // Schedule a retry with exponential backoff; stays 'pending' so the
        // next cron run picks it up once next_attempt_at has passed.
        const backoffMs = backoffMinutesFor(nextAttempt) * 60 * 1000;
        const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

        await supabase
          .from('review_requests')
          .update({
            attempts: nextAttempt,
            next_attempt_at: nextAttemptAt,
            last_error: message,
          })
          .eq('id', reviewRequest.id);

        retried += 1;
        results.push({ id: reviewRequest.id, status: 'retrying', error: message });
      }
    }
  }

  return NextResponse.json({ sent, retried, failed, skippedUnsubscribed, results });
}
