'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';

export type LoyaltyFormResult = { error?: string; success?: boolean };

export async function saveLoyaltyProgram(
  _prev: LoyaltyFormResult,
  formData: FormData
): Promise<LoyaltyFormResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const isActive = formData.get('is_active') === 'on';
  const pointsPerVisit = Number(formData.get('points_per_visit') ?? 10);
  const pointsPerReferral = Number(formData.get('points_per_referral') ?? 50);
  const pointsPerReview = Number(formData.get('points_per_review') ?? 20);
  const redemptionPoints = Number(formData.get('redemption_points') ?? 100);
  const redemptionRewardDescription = String(formData.get('redemption_reward_description') ?? '').trim();

  if ([pointsPerVisit, pointsPerReferral, pointsPerReview, redemptionPoints].some((n) => !Number.isFinite(n) || n < 0)) {
    return { error: 'Points values must be positive numbers.' };
  }

  if (!redemptionRewardDescription) {
    return { error: 'Describe what customers get when they redeem points.' };
  }

  const { error } = await supabase.from('loyalty_programs').upsert(
    {
      business_id: business.id,
      is_active: isActive,
      points_per_visit: pointsPerVisit,
      points_per_referral: pointsPerReferral,
      points_per_review: pointsPerReview,
      redemption_points: redemptionPoints,
      redemption_reward_description: redemptionRewardDescription,
    },
    { onConflict: 'business_id' }
  );

  if (error) {
    return { error: `Failed to save loyalty program: ${error.message}` };
  }

  revalidatePath('/settings/loyalty');
  return { success: true };
}

export async function redeemLoyaltyPoints(customerId: string) {
  const business = await requireBusiness();
  const supabase = createClient();

  const { data: program } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('business_id', business.id)
    .maybeSingle();

  if (!program || !program.is_active) return { error: 'Loyalty program is not active.' };

  const { data: entries } = await supabase
    .from('loyalty_ledger_entries')
    .select('delta')
    .eq('customer_id', customerId);

  const balance = (entries ?? []).reduce((sum, e) => sum + e.delta, 0);

  if (balance < program.redemption_points) {
    return { error: 'Customer does not have enough points to redeem.' };
  }

  await supabase.from('loyalty_ledger_entries').insert({
    business_id: business.id,
    customer_id: customerId,
    delta: -program.redemption_points,
    reason: 'redemption',
  });

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function createReferralPromotion(
  _prev: LoyaltyFormResult,
  formData: FormData
): Promise<LoyaltyFormResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const field = (key: string) => String(formData.get(key) ?? '').trim().slice(0, 200);
  const name = field('name');
  const referrerReward = field('referrer_reward');
  if (!name || !referrerReward) {
    return { error: 'Promotion name and referrer reward are required.' };
  }

  const { error } = await supabase.from('referral_promotions').insert({
    business_id: business.id,
    name,
    // The promotion name is the offer shown to the referred customer.
    customer_reward: name,
    referrer_reward: referrerReward,
  });
  if (error) return { error: 'Could not create promotion.' };

  revalidatePath('/settings/loyalty');
  revalidatePath('/referrals');
  return { success: true };
}

export async function deleteReferralPromotion(promotionId: string) {
  const business = await requireBusiness();
  const supabase = createClient();
  await supabase.from('referral_promotions').delete().eq('id', promotionId).eq('business_id', business.id);
  revalidatePath('/settings/loyalty');
  revalidatePath('/referrals');
  return { success: true };
}
