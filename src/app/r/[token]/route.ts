import type { NextRequest } from 'next/server';
import { handleReviewLinkRequest } from '@/lib/click-tracking';

export const dynamic = 'force-dynamic';

/**
 * Public review-link tracking endpoint: {APP_URL}/r/{tracking_token}.
 *
 * Records the click (bot-filtered, de-duplicated, with request/customer/
 * campaign ids, user agent, anonymised IP and destination), bumps the
 * per-send counters, then 302s to the business's review page. Runs with the
 * admin client because the person clicking has no session. See
 * src/lib/click-tracking.ts for the full behaviour.
 *
 * `token` is the message/review_request tracking_token; raw ids from older
 * links are accepted too.
 */
export async function GET(request: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  return handleReviewLinkRequest(request, { by: 'token', value: params.token });
}

/** Link-checkers often probe with HEAD; same redirect, never counted. */
export async function HEAD(request: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  return handleReviewLinkRequest(request, { by: 'token', value: params.token });
}
