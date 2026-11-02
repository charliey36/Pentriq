import type { NextRequest } from 'next/server';
import { handleReviewLinkRequest } from '@/lib/click-tracking';

export const dynamic = 'force-dynamic';

/**
 * Legacy click-tracking endpoint for the original `review_requests` flow
 * (/api/track/{reviewRequestId}). Kept so review emails already sitting in
 * customers' inboxes keep working; new emails link to /r/{token}. Delegates to
 * the shared handler (bot filtering, de-duplication, event logging, redirect).
 */
export async function GET(request: NextRequest, { params: paramsPromise }: { params: Promise<{ reviewRequestId: string }> }) {
  const params = await paramsPromise;
  return handleReviewLinkRequest(request, { by: 'review_request_id', value: params.reviewRequestId });
}

export async function HEAD(request: NextRequest, { params: paramsPromise }: { params: Promise<{ reviewRequestId: string }> }) {
  const params = await paramsPromise;
  return handleReviewLinkRequest(request, { by: 'review_request_id', value: params.reviewRequestId });
}
