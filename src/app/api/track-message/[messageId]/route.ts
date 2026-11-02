import type { NextRequest } from 'next/server';
import { handleReviewLinkRequest } from '@/lib/click-tracking';

export const dynamic = 'force-dynamic';

/**
 * Legacy click-tracking endpoint for the generalized `messages` table
 * (/api/track-message/{messageId}). Kept so emails already sent keep working;
 * new emails link to /r/{token}. Delegates to the shared handler, which
 * records the click, exits the journey enrollment on a genuine click (so no
 * more reminder steps fire) and 302s to the business's review URL - or to the
 * branded /review-unavailable page when the link is unknown or the business
 * has no valid review URL.
 */
export async function GET(request: NextRequest, { params: paramsPromise }: { params: Promise<{ messageId: string }> }) {
  const params = await paramsPromise;
  return handleReviewLinkRequest(request, { by: 'message_id', value: params.messageId });
}

export async function HEAD(request: NextRequest, { params: paramsPromise }: { params: Promise<{ messageId: string }> }) {
  const params = await paramsPromise;
  return handleReviewLinkRequest(request, { by: 'message_id', value: params.messageId });
}
