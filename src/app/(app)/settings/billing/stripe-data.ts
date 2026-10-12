import { getStripe } from '@/lib/stripe';
import { syncById } from '@/lib/stripe-sync';
import { stripeConfigured } from '@/lib/billing';
import { captureError } from '@/lib/monitoring';

export type PaymentMethodSummary = { brand: string; last4: string; expMonth: number; expYear: number } | null;
export type InvoiceSummary = {
  id: string;
  number: string | null;
  created: Date;
  amountPaid: number;
  currency: string;
  status: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
};

/**
 * Called when the user returns from Checkout. The webhook is the source of
 * truth, but it can arrive a moment after the redirect, so we also verify the
 * session belongs to this business and sync it immediately. Idempotent.
 */
export async function reconcileCheckout(sessionId: string, businessId: string): Promise<boolean> {
  if (!stripeConfigured()) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== businessId) return false;
    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (session.status !== 'complete' || !subId) return false;
    await syncById(subId, businessId);
    return true;
  } catch (e) {
    captureError(e, { area: 'stripe:checkout-reconcile', tags: { business_id: businessId } });
    return false;
  }
}

/** Card on file + recent invoices, fetched live from Stripe. Never throws. */
export async function loadStripeBillingDetails(customerId: string | null): Promise<{
  paymentMethod: PaymentMethodSummary;
  invoices: InvoiceSummary[];
}> {
  const empty = { paymentMethod: null, invoices: [] };
  if (!customerId || !stripeConfigured()) return empty;
  const stripe = getStripe();
  try {
    const [customer, invoices] = await Promise.all([
      stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] }),
      stripe.invoices.list({ customer: customerId, limit: 6 }),
    ]);

    let paymentMethod: PaymentMethodSummary = null;
    if (!customer.deleted) {
      let pm = customer.invoice_settings?.default_payment_method;
      if (!pm || typeof pm === 'string') {
        // Fall back to the first card on file (Checkout attaches it to the subscription).
        pm = (await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })).data[0] ?? null;
      }
      if (pm && typeof pm !== 'string' && pm.card) {
        paymentMethod = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        };
      }
    }

    return {
      paymentMethod,
      invoices: invoices.data.map((i) => ({
        id: i.id ?? '',
        number: i.number,
        created: new Date(i.created * 1000),
        amountPaid: i.amount_paid,
        currency: i.currency,
        status: i.status,
        hostedUrl: i.hosted_invoice_url ?? null,
        pdfUrl: i.invoice_pdf ?? null,
      })),
    };
  } catch (e) {
    captureError(e, { area: 'stripe:billing-details', tags: { stripe_customer_id: customerId } });
    return empty;
  }
}
