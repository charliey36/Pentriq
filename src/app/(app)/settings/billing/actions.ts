'use server';

import { redirect } from 'next/navigation';
import { requireBusiness, getAuthUser } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingState, stripeConfigured } from '@/lib/billing';
import { checkoutPriceId, getStripe } from '@/lib/stripe';
import { getAppUrl } from '@/lib/brand';

export type BillingResult = { error?: string; success?: boolean };

const NOT_CONFIGURED = 'Online payments are not switched on yet. Your free trial is unaffected.';
const GENERIC_ERROR = 'Something went wrong talking to Stripe. Please try again.';

/** Returns the business's Stripe customer id, creating the customer on first use. */
async function ensureStripeCustomer(business: { id: string; name: string; stripe_customer_id: string | null }) {
  if (business.stripe_customer_id) return business.stripe_customer_id;
  const user = await getAuthUser();
  const customer = await getStripe().customers.create({
    name: business.name || undefined,
    email: user?.email ?? undefined,
    metadata: { business_id: business.id },
  });
  await createAdminClient().from('businesses').update({ stripe_customer_id: customer.id }).eq('id', business.id);
  return customer.id;
}

/**
 * Starts the subscription: creates a Stripe-hosted Checkout Session and
 * redirects to it. Any remaining free-trial time is carried over, so the
 * first charge happens when the trial would have ended. The webhook (and the
 * success-page reconcile) writes the resulting subscription state.
 */
export async function startSubscription(): Promise<BillingResult> {
  const business = await requireBusiness();
  const priceId = checkoutPriceId();
  if (!stripeConfigured() || !priceId) return { error: NOT_CONFIGURED };

  const state = getBillingState(business);
  if (state.status === 'active' || state.status === 'past_due') {
    return { error: 'You already have a subscription. Use Manage billing to change it.' };
  }

  let url: string | null;
  try {
    const customerId = await ensureStripeCustomer(business);
    const appUrl = getAppUrl();

    // Stripe requires trial_end to be at least 48h away.
    const trialEnd = Math.floor(new Date(business.trial_ends_at).getTime() / 1000);
    const carryTrial = state.status === 'trialing' && trialEnd > Math.floor(Date.now() / 1000) + 2 * 86_400;

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: business.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { business_id: business.id },
        ...(carryTrial ? { trial_end: trialEnd } : {}),
      },
      metadata: { business_id: business.id },
      success_url: `${appUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings/billing?checkout=cancelled`,
    });
    url = session.url;
  } catch (e) {
    console.error('[stripe] checkout session failed:', e);
    return { error: GENERIC_ERROR };
  }
  if (!url) return { error: GENERIC_ERROR };
  redirect(url); // outside try/catch: redirect() works by throwing
}

/** Opens the Stripe Customer Portal (update card, change/cancel plan, invoices, receipts). */
export async function openBillingPortal(): Promise<BillingResult> {
  const business = await requireBusiness();
  if (!stripeConfigured()) return { error: NOT_CONFIGURED };
  if (!business.stripe_customer_id) return { error: 'No active subscription to manage.' };

  let url: string;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: business.stripe_customer_id,
      return_url: `${getAppUrl()}/settings/billing`,
    });
    url = session.url;
  } catch (e) {
    console.error('[stripe] portal session failed:', e);
    return {
      error:
        'Could not open the billing portal. If this is a new Stripe account, save your Customer Portal settings in the Stripe dashboard first.',
    };
  }
  redirect(url);
}
