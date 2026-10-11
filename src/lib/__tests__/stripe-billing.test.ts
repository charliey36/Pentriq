import { describe, expect, it } from '@jest/globals';
import { canUse, getBillingState, sendBlockedReason } from '@/lib/billing';
import { getPriceIds } from '@/lib/stripe';
import { mapStripeStatus } from '@/lib/stripe-sync';

const DAY = 86_400_000;
const now = new Date('2026-06-15T12:00:00Z');
const biz = (status: 'trialing' | 'active' | 'past_due' | 'canceled', trialOffsetDays: number) => ({
  subscription_status: status,
  trial_ends_at: new Date(now.getTime() + trialOffsetDays * DAY).toISOString(),
  created_at: new Date(now.getTime() - 5 * DAY).toISOString(),
});

describe('access control', () => {
  it('allows sending during a live trial', () => {
    expect(sendBlockedReason(biz('trialing', 9), now)).toBeNull();
    expect(getBillingState(biz('trialing', 9), now).trialDaysLeft).toBe(9);
  });
  it('blocks sending after the trial expires, but not viewing', () => {
    expect(sendBlockedReason(biz('trialing', -1), now)).toMatch(/trial has ended/);
    expect(canUse(biz('trialing', -1), 'view', now)).toBe(true);
  });
  it('allows active and past_due (Stripe is retrying), blocks canceled', () => {
    expect(sendBlockedReason(biz('active', -30), now)).toBeNull();
    expect(sendBlockedReason(biz('past_due', -30), now)).toBeNull();
    expect(sendBlockedReason(biz('canceled', 5), now)).not.toBeNull();
  });
});

describe('stripe mapping', () => {
  it('maps Stripe statuses to app statuses', () => {
    expect(mapStripeStatus('active')).toBe('active');
    expect(mapStripeStatus('trialing')).toBe('active');
    expect(mapStripeStatus('past_due')).toBe('past_due');
    expect(mapStripeStatus('unpaid')).toBe('past_due');
    expect(mapStripeStatus('canceled')).toBe('canceled');
    expect(mapStripeStatus('incomplete')).toBeNull();
  });
  it('parses STRIPE_PRICE_IDS with legacy fallback and de-duplication', () => {
    expect(getPriceIds({ STRIPE_PRICE_IDS: 'price_a, price_b', STRIPE_PRICE_ID: 'price_a' } as never)).toEqual(['price_a', 'price_b']);
    expect(getPriceIds({} as never)).toEqual([]);
  });
});
