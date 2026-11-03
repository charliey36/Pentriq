import { sendBlockedReason } from '@/lib/billing';
import { reviewLinkBlockedReason, REVIEW_LINK_RETRY_MS } from '@/lib/send-guards';
import { captureError } from '@/lib/monitoring';
import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyOwner } from '@/lib/notifications';
import { sendReviewRequestEmail } from '@/lib/email';
import { getAppUrl } from '@/lib/brand';
import { buildTrackingUrl } from '@/lib/click-tracking';
import { claimDue, dueFilter, MAX_BATCHES_PER_RUN, releaseClaims, runBudget, SEND_BATCH_SIZE, sendIdempotencyKey } from '@/lib/send-claim';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';
/** Seconds this function may run (allowed on every Vercel plan). Sending stops well inside it (send-claim.ts). */
export const maxDuration = 60;

type ReviewRequestRow = Database['public']['Tables']['review_requests']['Row'];
type Result = { id: string; status: 'sent' | 'retrying' | 'failed' | 'skipped'; error?: string };

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
 * pass it as an `Authorization: Bearer ...` header.
 * Configure Vercel Cron (see vercel.json) or any external scheduler to hit
 * this on an interval (e.g. every 5 minutes).
 *
 * Rows are claimed before they are sent (src/lib/send-claim.ts), oldest first, in batches until the run's time
 * budget is spent, so overlapping runs never send the same request twice and one run clears more than one batch.
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
  const results: Result[] = [];
  let skippedUnsubscribed = 0;
  let claimedElsewhere = 0;
  let released = 0;

  // A failure is recorded only while the row is still pending, so a late error can never overwrite a send
  // that has already been recorded.
  const recordFailure = async (reviewRequest: ReviewRequestRow, err: unknown): Promise<Result> => {
    captureError(err, { area: 'cron:send-review-requests', tags: { review_request_id: reviewRequest.id, business_id: reviewRequest.business_id } });
    const message = err instanceof Error ? err.message : 'Unknown error';
    const nextAttempt = reviewRequest.attempts + 1;

    if (nextAttempt >= reviewRequest.max_attempts) {
      // Exhausted retries — terminal failure.
      await supabase
        .from('review_requests')
        .update({ status: 'failed', attempts: nextAttempt, last_error: message })
        .eq('id', reviewRequest.id)
        .eq('status', 'pending');
      return { id: reviewRequest.id, status: 'failed', error: message };
    }

    // Schedule a retry with exponential backoff; stays 'pending' so the
    // next cron run picks it up once next_attempt_at has passed.
    const backoffMs = backoffMinutesFor(nextAttempt) * 60 * 1000;
    await supabase
      .from('review_requests')
      .update({ attempts: nextAttempt, next_attempt_at: new Date(Date.now() + backoffMs).toISOString(), last_error: message })
      .eq('id', reviewRequest.id)
      .eq('status', 'pending');
    return { id: reviewRequest.id, status: 'retrying', error: message };
  };

  const processRequest = async (reviewRequest: ReviewRequestRow): Promise<Result> => {
    try {
      const [{ data: customer }, { data: business }] = await Promise.all([
        supabase
          .from('customers')
          .select('name, email, unsubscribed_at')
          .eq('id', reviewRequest.customer_id)
          .single(),
        supabase
          .from('businesses')
          .select('*')
          .eq('id', reviewRequest.business_id)
          .single(),
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

      // Subscription required: defer a day instead of failing or starving the batch.
      if (sendBlockedReason(business, new Date(), ownerEmail ?? undefined)) {
        await supabase
          .from('review_requests')
          .update({ next_attempt_at: new Date(Date.now() + 86_400_000).toISOString() })
          .eq('id', reviewRequest.id);
        return { id: reviewRequest.id, status: 'skipped', error: 'Subscription required' };
      }

      // Review link not set up yet: hold the request and check again soon.
      if (reviewLinkBlockedReason(business, 'review_request')) {
        await supabase
          .from('review_requests')
          .update({ next_attempt_at: new Date(Date.now() + REVIEW_LINK_RETRY_MS).toISOString() })
          .eq('id', reviewRequest.id);
        return { id: reviewRequest.id, status: 'skipped', error: 'Review link not set up' };
      }

      // Consent check: never send to a customer who has unsubscribed,
      // even if their request was scheduled before they opted out.
      if (customer.unsubscribed_at) {
        await supabase
          .from('review_requests')
          .update({ status: 'cancelled' })
          .eq('id', reviewRequest.id);

        skippedUnsubscribed += 1;
        return { id: reviewRequest.id, status: 'skipped' };
      }

      const trackingUrl = buildTrackingUrl(appUrl, reviewRequest, { source: 'send-review-requests', kind: 'review_request' });
      const unsubscribeUrl = `${appUrl}/api/unsubscribe/${reviewRequest.customer_id}`;

      await sendReviewRequestEmail({
        to: customer.email,
        businessName: business.name,
        contactEmail: business.contact_email,
        customerName: customer.name,
        trackingUrl,
        unsubscribeUrl,
        idempotencyKey: sendIdempotencyKey('review_requests', reviewRequest.id, reviewRequest.attempts),
      });
    } catch (err) {
      return recordFailure(reviewRequest, err);
    }

    // Sent. From here on nothing may count as a failed send: a retry would email the customer again.
    const { error: markError } = await supabase
      .from('review_requests')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', reviewRequest.id);
    if (markError) {
      captureError(markError, { area: 'cron:send-review-requests', tags: { review_request_id: reviewRequest.id, step: 'mark_sent' } });
    }
    await notifyOwner('campaign', reviewRequest.business_id);
    return { id: reviewRequest.id, status: 'sent' };
  };

  batches: for (let batch = 0; batch < MAX_BATCHES_PER_RUN && !budget.outOfTime(); batch++) {
    // Due = pending, and either this is the first attempt (send_at has
    // passed, next_attempt_at is still null) or a retry is due
    // (next_attempt_at has passed). Oldest first.
    const { data: dueRequests, error } = await supabase
      .from('review_requests')
      .select('*')
      .eq('status', 'pending')
      .lte('send_at', nowIso)
      .or(dueFilter(nowIso))
      .order('send_at', { ascending: true })
      .limit(SEND_BATCH_SIZE);

    if (error) {
      captureError(error, { area: 'cron:send-review-requests' });
      if (batch === 0) return NextResponse.json({ error: `Failed to load due review requests: ${error.message}` }, { status: 500 });
      break;
    }
    if (!dueRequests || dueRequests.length === 0) break;

    const claim = await claimDue(supabase, 'review_requests', dueRequests.map((r) => r.id));
    if (claim.error) {
      captureError(new Error(claim.error), { area: 'cron:send-review-requests', tags: { step: 'claim' } });
      if (batch === 0) return NextResponse.json({ error: `Failed to claim due review requests: ${claim.error}` }, { status: 500 });
      break;
    }
    claimedElsewhere += dueRequests.length - claim.ids.size;
    const mine = dueRequests.filter((r) => claim.ids.has(r.id));
    // Nothing claimable: another run is working through these rows.
    if (mine.length === 0) break;

    for (let i = 0; i < mine.length; i++) {
      if (budget.outOfTime()) {
        const rest = mine.slice(i).map((r) => r.id);
        const releaseError = await releaseClaims(supabase, 'review_requests', rest, claim.leaseUntil, nowIso);
        if (releaseError) captureError(new Error(releaseError), { area: 'cron:send-review-requests', tags: { step: 'release' } });
        released += rest.length;
        break batches;
      }
      results.push(await processRequest(mine[i]));
    }
    if (dueRequests.length < SEND_BATCH_SIZE) break;
  }

  if (results.length === 0 && claimedElsewhere === 0 && released === 0) {
    return NextResponse.json({ sent: 0, failed: 0, retried: 0, message: 'No due review requests.' });
  }
  const tally = (status: Result['status']) => results.filter((r) => r.status === status).length;
  return NextResponse.json({ sent: tally('sent'), retried: tally('retrying'), failed: tally('failed'), skippedUnsubscribed, claimedElsewhere, released, results });
}
