import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, planNameForPrice } from '@/lib/stripe';
import { captureError } from '@/lib/monitoring';
import type { Business } from '@/lib/database.types';

type AppStatus = Business['subscription_status'];

/**
 * Maps a Stripe subscription status onto the app's coarse status
 * (businesses.subscription_status). `null` = leave the app status unchanged
 * (e.g. an incomplete first payment must not unlock or lock anything).
 */
export function mapStripeStatus(status: Stripe.Subscription.Status): AppStatus | null {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return null; // incomplete, paused
  }
}

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

/** Newer Stripe API versions keep the billing period on the subscription item. */
export function periodEndOf(sub: Stripe.Subscription): string | null {
  return iso(sub.items?.data?.[0]?.current_period_end);
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

/** Finds the business a Stripe object belongs to. */
async function findBusinessId(hint: {
  businessId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<string | null> {
  if (hint.businessId) return hint.businessId;
  const db = createAdminClient();
  if (hint.subscriptionId) {
    const { data } = await db
      .from('subscriptions')
      .select('business_id')
      .eq('stripe_subscription_id', hint.subscriptionId)
      .maybeSingle();
    if (data) return data.business_id;
  }
  if (hint.customerId) {
    const { data } = await db.from('businesses').select('id').eq('stripe_customer_id', hint.customerId).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

/**
 * Writes a Stripe subscription into both `subscriptions` (full mirror) and
 * `businesses` (the fields the app's access control reads).
 */
export async function syncSubscription(sub: Stripe.Subscription, businessIdHint?: string | null): Promise<void> {
  const customerId = idOf(sub.customer);
  const businessId = await findBusinessId({
    businessId: businessIdHint ?? sub.metadata?.business_id,
    customerId,
    subscriptionId: sub.id,
  });
  if (!businessId) {
    throw new Error(`No Pentriq business found for Stripe subscription ${sub.id} (customer ${customerId}).`);
  }

  const db = createAdminClient();
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const periodEnd = periodEndOf(sub);

  const { error: subErr } = await db.from('subscriptions').upsert(
    {
      business_id: businessId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_name: planNameForPrice(priceId),
      status: sub.status,
      current_period_end: periodEnd,
      trial_end: iso(sub.trial_end),
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id' }
  );
  if (subErr) throw new Error(`Failed to save subscription: ${subErr.message}`);

  const appStatus = mapStripeStatus(sub.status);
  const { error: bizErr } = await db
    .from('businesses')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd,
      ...(appStatus ? { subscription_status: appStatus } : {}),
    })
    .eq('id', businessId);
  if (bizErr) throw new Error(`Failed to update business billing state: ${bizErr.message}`);
}

/** Re-fetches from Stripe (so out-of-order events can't overwrite newer state) and syncs. */
export async function syncById(subscriptionId: string, businessIdHint?: string | null) {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  await syncSubscription(sub, businessIdHint);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription ?? null);
}

/** Dispatches one verified Stripe event. Throws on failure so Stripe retries. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') return;
      const businessId = session.client_reference_id ?? session.metadata?.business_id ?? null;
      const customerId = idOf(session.customer);
      if (businessId && customerId) {
        await createAdminClient().from('businesses').update({ stripe_customer_id: customerId }).eq('id', businessId);
      }
      const subId = idOf(session.subscription);
      if (subId) await syncById(subId, businessId);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      try {
        await syncById(sub.id);
      } catch (e) {
        if (event.type === 'customer.subscription.deleted') {
          await syncSubscription({ ...sub, status: 'canceled' });
          return;
        }
        throw e;
      }
      return;
    }
    case 'invoice.paid': {
      const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      if (subId) await syncById(subId);
      return;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoiceSubscriptionId(invoice);
      if (subId) await syncById(subId);
      // A failed payment is a business event, not an exception, so report it explicitly.
      captureError(`Stripe payment failed for invoice ${invoice.id}`, {
        area: 'stripe:payment-failed',
        tags: { stripe_event_type: event.type, stripe_customer_id: idOf(invoice.customer), stripe_subscription_id: subId },
      });
      return;
    }
    case 'checkout.session.expired': {
      // Nothing was paid; no state to change. Logged for visibility.
      const session = event.data.object as Stripe.Checkout.Session;
      console.info(`[stripe] checkout session expired: ${session.id}`);
      return;
    }
    default:
      return;
  }
}
