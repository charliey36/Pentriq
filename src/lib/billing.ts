import type { Business } from '@/lib/database.types';
import { APP_NAME } from '@/lib/brand';

/** The one and only Pentriq plan. Change the price here (and in Stripe) only. */
export const PLAN = {
  name: APP_NAME,
  priceMonthly: 19.99,
  currency: '£',
  perks: [
    'Unlimited customers and review requests',
    'Automatic email follow-up reminders',
    'Private feedback inbox',
    'Analytics and reporting',
  ],
};

export const TRIAL_DAYS = 14;

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
export type BillingInput = Pick<Business, 'subscription_status' | 'trial_ends_at' | 'created_at'>;

export function getBillingState(b: BillingInput, now = new Date()): BillingState {
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

export function canUse(b: BillingInput, feature: Feature, now = new Date()): boolean {
  if (FREE_FEATURES.includes(feature)) return true;
  return getBillingState(b, now).hasAccess;
}

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  'Your free trial has ended. Subscribe in Settings → Billing to keep sending messages.';

export const TRIAL_NOT_STARTED_MESSAGE =
  'Start your 14-day free trial (or subscribe) in Settings → Billing to begin sending messages.';

/** Throws-free guard for send paths: returns an error string when blocked. */
export function sendBlockedReason(b: BillingInput, now = new Date()): string | null {
  if (canUse(b, 'send_messages', now)) return null;
  return getBillingState(b, now).status === 'trial_available' ? TRIAL_NOT_STARTED_MESSAGE : SUBSCRIPTION_REQUIRED_MESSAGE;
}
