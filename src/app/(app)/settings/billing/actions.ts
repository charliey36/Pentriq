'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireBusiness, getAuthUser } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingState, stripeConfigured, TRIAL_DAYS } from '@/lib/billing';
import { checkoutPriceId, getStripe } from '@/lib/stripe';
import { getAppUrl } from '@/lib/brand';
import { captureError } from '@/lib/monitoring';
import { isPauseOption, isPaused, pauseEnd } from '@/lib/pause';

export type BillingResult = { error?: string; success?: boolean };

const NOT_CONFIGURED = 'Online payments are not switched on yet. Your free trial is unaffected.';
const GENERIC_ERROR = 'Something went wrong talking to Stripe. Please try again.';

/**
 * Claims the 30-day free trial. The trial is opt-in: it never starts at
 * signup. The update is conditional on `trial_ends_at IS NULL`, so a double
 * click or two tabs cannot restart or extend it, and a business that has ever
 * claimed (or subscribed) is refused.
 */
export async function claimTrial(): Promise<BillingResult> {
  const business = await requireBusiness();
  if (getBillingState(business).status !== 'trial_available') {
    return { error: 'Your free trial has already been used.' };
  }

  const now = new Date();
  const { data, error } = await createAdminClient()
    .from('businesses')
    .update({
      trial_claimed_at: now.toISOString(),
      trial_ends_at: new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString(),
      subscription_status: 'trialing',
    })
    .eq('id', business.id)
    .eq('subscription_status', 'trialing')
    .is('trial_ends_at', null)
    .select('id');

  if (error) {
    captureError(error, { area: 'billing:claim-trial', tags: { business_id: business.id } });
    return { error: 'Could not start your trial. Please try again.' };
  }
  if (!data?.length) return { error: 'Your free trial has already been used.' };

  // Anything queued before the trial started was deferred by the sender (one day
  // at a time); make it due now instead of making the owner wait up to 24h.
  await createAdminClient()
    .from('messages')
    .update({ next_attempt_at: now.toISOString() })
    .eq('business_id', business.id)
    .in('status', ['queued', 'pending'])
    .gt('next_attempt_at', now.toISOString());

  revalidatePath('/', 'layout');
  return { success: true };
}

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
    const trialEnd = business.trial_ends_at ? Math.floor(new Date(business.trial_ends_at).getTime() / 1000) : 0;
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
    captureError(e, { area: 'stripe:checkout-session', tags: { business_id: business.id, stripe_customer_id: business.stripe_customer_id } });
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
    captureError(e, { area: 'stripe:customer-portal', tags: { business_id: business.id, stripe_customer_id: business.stripe_customer_id } });
    return {
      error:
        'Could not open the billing portal. If this is a new Stripe account, save your Customer Portal settings in the Stripe dashboard first.',
    };
  }
  redirect(url);
}

/**
 * Pauses a paid subscription instead of cancelling it. Stripe stops collecting
 * payment (`pause_collection`, invoices voided) and Pentriq stops sending to
 * customers until the pause ends or the owner resumes. If Stripe fails we do
 * NOT mark the business paused, so nobody is left paying for a paused account.
 */
export async function pauseSubscription(_prev: BillingResult, formData: FormData): Promise<BillingResult> {
  const business = await requireBusiness();
  const option = formData.get('option');
  if (!isPauseOption(option)) return { error: 'Choose how long to pause for.' };
  const state = getBillingState(business);
  if (state.status !== 'active' && state.status !== 'past_due') return { error: 'Only an active subscription can be paused.' };
  if (isPaused(business)) return { error: 'Your subscription is already paused.' };

  const now = new Date();
  const end = pauseEnd(option, now);
  if (stripeConfigured() && business.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.update(business.stripe_subscription_id, {
        pause_collection: { behavior: 'void', ...(end ? { resumes_at: Math.floor(end.getTime() / 1000) } : {}) },
      });
    } catch (e) {
      captureError(e, { area: 'stripe:pause-subscription', tags: { business_id: business.id } });
      return { error: GENERIC_ERROR };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('businesses')
    .update({ paused_at: now.toISOString(), paused_until: end ? end.toISOString() : null, pause_indefinite: end === null })
    .eq('id', business.id);
  if (error) {
    captureError(error, { area: 'billing:pause-subscription', tags: { business_id: business.id } });
    return { error: 'Your payment was paused but we could not save the pause. Please contact support.' };
  }

  // Scheduled sends would otherwise fire in a burst the day the pause ends: stop them now.
  await admin.from('messages').update({ status: 'cancelled', last_error: 'Subscription paused' }).eq('business_id', business.id).eq('status', 'pending');
  await admin.from('journey_enrollments').update({ status: 'exited' }).eq('business_id', business.id).eq('status', 'active');

  revalidatePath('/', 'layout');
  return { success: true };
}

/** Ends a pause early: payment collection resumes and sending is allowed again. */
export async function resumeSubscription(): Promise<BillingResult> {
  const business = await requireBusiness();
  if (!business.paused_at) return { error: 'Your subscription is not paused.' };

  if (stripeConfigured() && business.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.update(business.stripe_subscription_id, { pause_collection: '' });
    } catch (e) {
      captureError(e, { area: 'stripe:resume-subscription', tags: { business_id: business.id } });
      return { error: GENERIC_ERROR };
    }
  }
  const { error } = await createAdminClient()
    .from('businesses')
    .update({ paused_at: null, paused_until: null, pause_indefinite: false })
    .eq('id', business.id);
  if (error) return { error: 'Could not resume your subscription. Please try again.' };
  revalidatePath('/', 'layout');
  return { success: true };
}
