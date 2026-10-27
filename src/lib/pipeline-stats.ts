/**
 * Dashboard numbers for the review pipeline: first requests, each reminder, how
 * many customers followed through, and how many requests the safeguards blocked.
 *
 * "Reviews completed" counts customers who followed the review link. Pentriq can
 * not see inside Google, so a click is the closest honest signal; reviews Google
 * itself reports appear in Reviews Analytics.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { countReviewsReceived, countUniqueClicked } from '@/lib/click-analytics';
import type { BlockReason } from '@/lib/safeguards';

type Db = SupabaseClient<Database>;

export type PipelineStats = {
  requestsSent: number;
  reminder1Sent: number;
  reminder2Sent: number;
  reviewsCompleted: number;
  blocked: Record<BlockReason, number>;
};

const head = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export async function loadPipelineStats(supabase: Db, businessId: string): Promise<PipelineStats> {
  const sentMessages = (purpose: 'review_request' | 'review_reminder', step?: number) => {
    let q = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('purpose', purpose).eq('status', 'sent');
    if (step) q = q.eq('sequence_step', step);
    return q;
  };
  const blocked = (reason: BlockReason) =>
    supabase.from('review_request_blocks').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('reason', reason);

  const [first, legacy, r1, r2, clicked, confirmed, frequency, optOut, duplicate] = await Promise.all([
    head(sentMessages('review_request')),
    head(supabase.from('review_requests').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'sent')),
    head(sentMessages('review_reminder', 2)),
    head(sentMessages('review_reminder', 3)),
    countUniqueClicked(supabase, businessId),
    countReviewsReceived(supabase, businessId),
    head(blocked('frequency')),
    head(blocked('opt_out')),
    head(blocked('duplicate')),
  ]);

  return {
    requestsSent: first + legacy,
    reminder1Sent: r1,
    reminder2Sent: r2,
    reviewsCompleted: Math.max(clicked, confirmed),
    blocked: { frequency, opt_out: optOut, duplicate },
  };
}
