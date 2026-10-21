'use server';

import { logEvent, userSafeError } from '@/lib/log';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import { sendReferralEmail, sendReferralRedeemedEmail } from '@/lib/email';

export type ReferralFormResult = { error?: string; success?: boolean; code?: string; qrUrl?: string };
export type ReferralValidation = {
  error?: string;
  valid?: boolean;
  id?: string;
  code?: string;
  referrerName?: string;
  referralReward?: string;
  newCustomerReward?: string;
};

function generateCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function qrUrl(code: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/referrals?code=${encodeURIComponent(code)}`;
}

export async function createReferralCode(_prev: ReferralFormResult, formData: FormData): Promise<ReferralFormResult> {
  const business = await requireBusiness();
  const supabase = createClient();
  const customerId = String(formData.get('customer_id') ?? '').trim();
  if (!customerId) return { error: 'Choose a customer.' };
  const { data: customer } = await supabase.from('customers').select('id,name').eq('id', customerId).eq('business_id', business.id).maybeSingle();
  if (!customer) return { error: 'Customer not found.' };
  const promotionId = String(formData.get('promotion_id') ?? '').trim();
  if (!promotionId) return { error: 'Choose a promotion.' };
  const { data: promotion } = await supabase.from('referral_promotions').select('id,name,customer_reward,referrer_reward').eq('id', promotionId).eq('business_id', business.id).maybeSingle();
  if (!promotion) return { error: 'Promotion not found.' };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateCode();
    const { error } = await supabase.from('referrals').insert({ business_id: business.id, referrer_customer_id: customerId, code, status: 'active', promotion_id: promotion.id, promotion_name: promotion.name, customer_reward: promotion.customer_reward, referrer_reward: promotion.referrer_reward });
    if (!error) { logEvent('referral', 'code_created', { businessId: business.id, promotionId: promotion.id }); revalidatePath('/referrals'); return { success: true, code, qrUrl: qrUrl(code) }; }
    if (!error.message.toLowerCase().includes('duplicate') && error.code !== '23505') {
      return { error: userSafeError('Could not generate referral code', error) };
    }
  }
  return { error: 'Could not generate a unique referral code after 10 attempts. Please try again.' };
}

export async function sendReferralInvitation(code: string): Promise<ReferralFormResult> {
  const business = await requireBusiness();
  const supabase = createClient();
  const { data: referral } = await supabase.from('referrals').select('code,referrer_customer_id,customer_reward,referrer_reward').eq('business_id', business.id).eq('code', code).maybeSingle();
  if (!referral) return { error: 'Referral code not found.' };
  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabase.from('customers').select('name,email').eq('id', referral.referrer_customer_id).maybeSingle(),
    supabase.from('businesses').select('name').eq('id', business.id).maybeSingle(),
  ]);
  if (!customer?.email) return { error: 'The referring customer has no email address.' };
  await sendReferralEmail({ to: customer.email, customerName: customer.name, businessName: settings?.name ?? 'your business', code: referral.code, customerReward: referral.customer_reward ?? '£10 off your first appointment', referrerReward: referral.referrer_reward ?? '100 Loyalty Points', qrUrl: qrUrl(referral.code) });
  return { success: true };
}

export async function validateReferralCode(code: string): Promise<ReferralValidation> {
  const business = await requireBusiness();
  const supabase = createClient();
  const { data: referral } = await supabase.from('referrals').select('id,code,status,referrer_customer_id,customer_reward,referrer_reward').eq('business_id', business.id).eq('code', code.trim()).maybeSingle();
  if (!referral) return { error: 'Referral code not found.' };
  if (referral.status === 'redeemed') return { error: 'This referral code has already been redeemed.' };
  if (referral.status === 'expired') return { error: 'This referral code has expired.' };
  const [{ data: customer }, { data: program }] = await Promise.all([
    supabase.from('customers').select('name').eq('id', referral.referrer_customer_id).maybeSingle(),
    supabase.from('loyalty_programs').select('points_per_referral').eq('business_id', business.id).eq('is_active', true).maybeSingle(),
  ]);
  return { valid: true, id: referral.id, code: referral.code, referrerName: customer?.name ?? 'Unknown customer', referralReward: referral.referrer_reward ?? `${program?.points_per_referral ?? 100} Loyalty Points`, newCustomerReward: referral.customer_reward ?? '£10 off first appointment' };
}

export async function redeemReferralCode(referralId: string): Promise<ReferralFormResult> {
  const business = await requireBusiness();
  const supabase = createClient();
  const { data: referral } = await supabase.from('referrals').select('id,code,referrer_customer_id,promotion_id,referrer_reward').eq('id', referralId).eq('business_id', business.id).eq('status', 'active').maybeSingle();
  if (!referral) return { error: 'This referral code is no longer active.' };
  const now = new Date().toISOString();
  const { error } = await supabase.from('referrals').update({ status: 'redeemed', redeemed_at: now, reward_granted_at: now }).eq('id', referral.id).eq('status', 'active');
  if (error) return { error: 'Could not redeem this referral code.' };
  const { data: program } = await supabase.from('loyalty_programs').select('points_per_referral').eq('business_id', business.id).eq('is_active', true).maybeSingle();
  // The promotion decides the referrer's reward: points go on the ledger, a custom reward is only announced.
  const { data: promotion } = referral.promotion_id
    ? await supabase.from('referral_promotions').select('referrer_reward,referrer_reward_type,referrer_points').eq('id', referral.promotion_id).maybeSingle()
    : { data: null };
  const rewardLabel = promotion?.referrer_reward ?? referral.referrer_reward ?? `${program?.points_per_referral ?? 100} Loyalty Points`;
  const points = promotion ? (promotion.referrer_reward_type === 'points' ? promotion.referrer_points ?? 0 : 0) : program?.points_per_referral ?? 100;
  if (program && points > 0) await supabase.from('loyalty_ledger_entries').insert({ business_id: business.id, customer_id: referral.referrer_customer_id, delta: points, reason: 'referral', reference_type: 'referral', reference_id: referral.id });
  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabase.from('customers').select('name,email').eq('id', referral.referrer_customer_id).maybeSingle(),
    supabase.from('businesses').select('name').eq('id', business.id).maybeSingle(),
  ]);
  if (customer?.email) await sendReferralRedeemedEmail({ to: customer.email, businessName: settings?.name ?? 'your business', code: referral.code, reward: rewardLabel });
  logEvent('referral', 'redeemed', { businessId: business.id, referralId: referral.id, points });
  revalidatePath('/referrals');
  return { success: true };
}

export async function deleteReferral(referralId: string): Promise<ReferralFormResult> {
  const business = await requireBusiness();
  const supabase = createClient();
  const { error } = await supabase.from('referrals').delete().eq('id', referralId).eq('business_id', business.id);
  if (error) return { error: 'Could not delete referral.' };
  revalidatePath('/referrals');
  return { success: true };
}
