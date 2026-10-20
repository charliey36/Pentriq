import { describe, expect, it } from '@jest/globals';
import { canUse, getBillingState, sendBlockedReason } from '@/lib/billing';
import { getPriceIds } from '@/lib/stripe';
import { mapStripeStatus } from '@/lib/stripe-sync';

const DAY = 86_400_000;
const now = new Date('2026-06-15T12:00:00Z');
const biz = (status: 'trialing' | 'active' | 'past_due' | 'canceled', trialOffsetDays: number | null) => ({
  subscription_status: status,
  trial_ends_at: trialOffsetDays === null ? null : new Date(now.getTime() + trialOffsetDays * DAY).toISOString(),
  created_at: new Date(now.getTime() - 5 * DAY).toISOString(),
});

describe('opt-in trial', () => {
  it('does not start a trial until it is claimed', () => {
    const state = getBillingState(biz('trialing', null), now);
    expect(state.status).toBe('trial_available');
    expect(state.hasAccess).toBe(false);
    expect(sendBlockedReason(biz('trialing', null), now)).toMatch(/Start your 30-day free trial/);
    expect(canUse(biz('trialing', null), 'view', now)).toBe(true);
  });
  it('starts counting from the claimed end date', () => {
    expect(getBillingState(biz('trialing', 14), now)).toMatchObject({ status: 'trialing', trialDaysLeft: 14, hasAccess: true });
  });
  it('lets someone who subscribes without claiming send; cancelling does not re-open the trial', () => {
    expect(sendBlockedReason(biz('active', null), now)).toBeNull();
    expect(getBillingState(biz('canceled', null), now).status).toBe('canceled');
  });
  it('falls back to the legacy automatic trial when the column does not exist yet', () => {
    const legacy = { subscription_status: 'trialing' as const, created_at: new Date(now.getTime() - 5 * DAY).toISOString() } as never;
    expect(getBillingState(legacy, now)).toMatchObject({ status: 'trialing', trialDaysLeft: 25 });
  });

  it('keeps the specified account active regardless of stored trial state', () => {
    const expired = biz('canceled', -100);
    expect(getBillingState(expired, now, 'charlieyoults123@gmail.com')).toMatchObject({ status: 'active', hasAccess: true });
    expect(sendBlockedReason(expired, now, 'charlieyoults123@gmail.com')).toBeNull();
    expect(getBillingState(expired, now, 'other@example.com').hasAccess).toBe(false);
  });
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
