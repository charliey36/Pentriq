'use server';

import { revalidatePath } from 'next/cache';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConnectionWithTokens } from '@/lib/google-connection';
import { GoogleApiError, replyToReview } from '@/lib/google-business';
import { getAccessToken } from '@/lib/google-review-sync';
import { MAX_REPLY_LENGTH } from '@/lib/google-business-constants';
import { getBillingState } from '@/lib/billing';
import { withinLimit } from '@/lib/rate-limit';
import { generateGeminiText } from '@/lib/gemini';
import { aiConfigured, draftReviewReply, firstName } from '@/lib/ai-review-reply';

export type ReplyResult = { ok: boolean; message: string; replyText?: string; replyUpdateTime?: string };

/**
 * Publishes (or replaces) the owner's reply on Google, then stores it locally.
 * Google is called first: if it rejects the reply nothing is saved, so the
 * database never claims a reply that isn't live. Later syncs re-read the
 * reply from Google, so edits made on Google itself also flow back.
 */
export async function replyToGoogleReview(reviewId: string, text: string): Promise<ReplyResult> {
  const business = await requireBusiness();
  const reply = text.trim();
  if (!reply) return { ok: false, message: 'Write a reply first.' };
  if (reply.length > MAX_REPLY_LENGTH) {
    return { ok: false, message: `Replies can be at most ${MAX_REPLY_LENGTH} characters.` };
  }

  const admin = createAdminClient();
  const { data: review } = await admin
    .from('google_reviews')
    .select('id, google_review_id')
    .eq('id', reviewId)
    .eq('business_id', business.id)
    .maybeSingle();
  if (!review) return { ok: false, message: 'Review not found.' };

  const conn = await getConnectionWithTokens(business.id);
  if (!conn || conn.status !== 'active' || !conn.google_location_id) {
    return { ok: false, message: 'Google Business Profile is not connected. Reconnect it in Settings → Integrations.' };
  }

  try {
    const token = await getAccessToken(admin, conn);
    const published = await replyToReview(token, conn.google_account_id, conn.google_location_id, review.google_review_id, reply);
    const { error } = await admin
      .from('google_reviews')
      .update({ reply_text: published.comment, reply_update_time: published.updateTime })
      .eq('id', review.id);
    if (error) throw new Error(error.message);

    revalidatePath('/reviews');
    return { ok: true, message: 'Reply published on Google.', replyText: published.comment, replyUpdateTime: published.updateTime };
  } catch (err) {
    console.error('[google-reply] failed:', err instanceof Error ? err.message : err);
    if (err instanceof GoogleApiError) {
      if (err.isAuthRevoked) return { ok: false, message: 'Google access expired. Reconnect in Settings → Integrations.' };
      return { ok: false, message: `Google rejected the reply: ${err.message}` };
    }
    return { ok: false, message: 'Could not publish the reply. Please try again.' };
  }
}

export async function markReviewAlertsRead(): Promise<void> {
  const business = await requireBusiness();
  await createClient()
    .from('review_alerts')
    .update({ is_read: true })
    .eq('business_id', business.id)
    .eq('is_read', false);
  revalidatePath('/', 'layout');
}

export type DraftResult = { ok: boolean; message?: string; text?: string };

/**
 * Drafts a reply with AI. Nothing is posted: the text lands in the editable reply box.
 * Limited to 20 drafts an hour per business and to businesses with an active trial or subscription.
 */
export async function draftReviewReplyAction(reviewId: string): Promise<DraftResult> {
  const business = await requireBusiness();
  if (!aiConfigured()) return { ok: false, message: 'AI drafting is not switched on for this account yet.' };
  if (!getBillingState(business).hasAccess) return { ok: false, message: 'AI drafting is available during your trial or on a subscription.' };
  if (!(await withinLimit('ai-reply-draft', business.id, { limit: 20, windowSeconds: 3600 }))) {
    return { ok: false, message: 'You have used your AI drafts for this hour. Please try again later.' };
  }

  const { data: review } = await createAdminClient()
    .from('google_reviews')
    .select('rating, comment, reviewer_name')
    .eq('id', reviewId)
    .eq('business_id', business.id)
    .maybeSingle();
  if (!review) return { ok: false, message: 'Review not found.' };

  try {
    const text = await draftReviewReply(
      { businessName: business.name, rating: review.rating, comment: review.comment, reviewerFirstName: firstName(review.reviewer_name) },
      (prompt) => generateGeminiText(prompt, { quick: true })
    );
    return { ok: true, text };
  } catch (err) {
    console.error('[ai-reply] failed:', err instanceof Error ? err.message : err);
    return { ok: false, message: err instanceof Error ? err.message : 'Could not draft a reply. Please try again.' };
  }
}
