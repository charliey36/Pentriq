import type { Business } from '@/lib/database.types';
import { APP_NAME } from '@/lib/brand';
import { isPaused, PAUSED_MESSAGE, type PauseFields } from '@/lib/pause';

/** The one and only Pentriq plan. Change the price here (and in Stripe) only. */
export const PLAN = {
  name: APP_NAME,
  priceMonthly: 19,
  currency: '£',
  perks: [
    'Unlimited customers and review requests, no per-message fees',
    'Automatic Google review requests with two follow-up reminders',
    'Private feedback inbox on every request',
    'Rebooking and win-back reminders for lapsed customers',
    'Google reviews sync, rating alerts and reply from Pentriq',
    'Loyalty points, referral codes and customer segments',
    'CSV import, plus Square, Acuity and Calendly sync',
    'QR code and a reviews widget for your website',
    'Analytics, weekly summary email and full data export',
  ],

};

export const TRIAL_DAYS = 30;
/**
 * Accounts that never need to pay (the operator's own / internal accounts). Comma-separated list in
 * the BILLING_OVERRIDE_EMAILS environment variable. Deliberately NOT hard-coded: a deployment with
 * the variable unset has no free-access accounts at all.
 */
export function isBillingOverrideEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.BILLING_OVERRIDE_EMAILS;
  if (!raw || !email) return false;
  return raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}

export type BillingState = {
  /**
   * `trial_available` = the owner has not claimed the free trial yet. The trial
   * is opt-in (Settings → Billing), so a new account cannot send until they
   * either claim it or subscribe.
   */
  status: 'trial_available' | 'trialing' | 'trial_expired' | 'active' | 'past_due' | 'canceled';
  trialDaysLeft: number;
  /** Whether sending/using the product is allowed. */
  hasAccess: boolean;
};

/** The subset of a business row the billing logic needs. */
export type BillingInput = Pick<Business, 'subscription_status' | 'trial_ends_at' | 'created_at'> & PauseFields;

export function getBillingState(b: BillingInput, now = new Date(), ownerEmail?: string): BillingState {
  if (isBillingOverrideEmail(ownerEmail)) {
    return { status: 'active', trialDaysLeft: TRIAL_DAYS, hasAccess: true };
  }
  const status = b.subscription_status ?? 'trialing';

  // Trial not claimed yet: after migration 0023 the column exists and is NULL.
  // (`undefined` means the column is missing because the migration has not been
  // applied; fall through to the legacy automatic-trial behaviour below so an
  // un-migrated database keeps working.)
  if (status === 'trialing' && b.trial_ends_at === null) {
    return { status: 'trial_available', trialDaysLeft: TRIAL_DAYS, hasAccess: false };
  }

  const trialEnd = b.trial_ends_at
    ? new Date(b.trial_ends_at).getTime()
    : new Date(b.created_at).getTime() + TRIAL_DAYS * 86_400_000;
  const msLeft = trialEnd - now.getTime();
  const trialDaysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  if (status === 'trialing') {
    return msLeft > 0
      ? { status: 'trialing', trialDaysLeft, hasAccess: true }
      : { status: 'trial_expired', trialDaysLeft: 0, hasAccess: false };
  }
  return {
    status,
    trialDaysLeft,
    // past_due keeps access (Stripe retries); canceled does not.
    hasAccess: status === 'active' || status === 'past_due',
  };
}

/** True once STRIPE_SECRET_KEY and a price id (STRIPE_PRICE_IDS / STRIPE_PRICE_ID) are set. */
export const stripeConfigured = () =>
  Boolean(process.env.STRIPE_SECRET_KEY && (process.env.STRIPE_PRICE_IDS || process.env.STRIPE_PRICE_ID));

/**
 * Feature tiers. This is the ONE place that decides what each billing state
 * may do — call sites use `canUse(business, feature)` / `assertCanSend()`
 * rather than checking status strings themselves.
 *
 *  - free (always available, even after the trial ends / cancellation):
 *      viewing and exporting data, settings, billing, private feedback inbox,
 *      reputation tracking, unsubscribe + public feedback pages.
 *  - trial and paid (hasAccess): everything that sends messages to customers.
 */
export type Feature = 'view' | 'send_messages' | 'automation';

const FREE_FEATURES: Feature[] = ['view'];

export function canUse(b: BillingInput, feature: Feature, now = new Date(), ownerEmail?: string): boolean {
  if (FREE_FEATURES.includes(feature)) return true;
  return getBillingState(b, now, ownerEmail).hasAccess;
}

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  'Your free trial has ended. Subscribe in Settings → Billing to keep sending messages.';

export const TRIAL_NOT_STARTED_MESSAGE =
  'Finish setup to start your 30-day free trial (or subscribe in Settings → Billing) and begin sending messages.';

/** Throws-free guard for send paths: returns an error string when blocked. */
export function sendBlockedReason(b: BillingInput, now = new Date(), ownerEmail?: string): string | null {
  if (isPaused(b, now)) return PAUSED_MESSAGE;
  if (canUse(b, 'send_messages', now, ownerEmail)) return null;
  return getBillingState(b, now, ownerEmail).status === 'trial_available' ? TRIAL_NOT_STARTED_MESSAGE : SUBSCRIPTION_REQUIRED_MESSAGE;
}
