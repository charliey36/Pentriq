import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { getBillingState, PLAN } from '@/lib/billing';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { SettingsTabs } from '@/components/settings-tabs';
import { Notice } from '@/components/ui/notice';
import { createClient } from '@/lib/supabase/server';
import { BillingButton } from './billing-button';
import { loadStripeBillingDetails, reconcileCheckout } from './stripe-data';
import { openBillingPortal, startSubscription, claimTrial, type BillingResult } from './actions';

export const metadata: Metadata = { title: 'Billing' };

const LABELS: Record<string, { text: string; tone: BadgeTone }> = {
  trial_available: { text: 'Trial not started', tone: 'neutral' },
  trialing: { text: 'Free trial', tone: 'info' },
  trial_expired: { text: 'Trial ended', tone: 'warning' },
  active: { text: 'Active', tone: 'success' },
  past_due: { text: 'Payment failed', tone: 'danger' },
  canceled: { text: 'Canceled', tone: 'neutral' },
};

const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100);

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: { checkout?: string; session_id?: string };
}) {
  let business = await requireBusiness();

  // Returning from Stripe Checkout: sync immediately instead of waiting for the webhook.
  const checkout = searchParams?.checkout;
  let reconciled = false;
  if (checkout === 'success' && searchParams?.session_id) {
    reconciled = await reconcileCheckout(searchParams.session_id, business.id);
    if (reconciled) {
      const { data } = await createClient().from('businesses').select('*').eq('id', business.id).single();
      if (data) business = data;
    }
  }

  const supabase = createClient();
  const { data: sub } = await supabase.from('subscriptions').select('*').eq('business_id', business.id).maybeSingle();
  const { paymentMethod, invoices } = await loadStripeBillingDetails(business.stripe_customer_id);
  const billing = getBillingState(business);
  const label = LABELS[billing.status] ?? LABELS.trialing;
  const subscribed = billing.status === 'active' || billing.status === 'past_due';

  return (
    <div>
      <PageHeader
        title="Billing"
        icon="cog"
        tone="slate"
        description="One simple plan. Cancel any time."
        tabs={<SettingsTabs />}
      />
      <div className="space-y-6">
        {checkout === 'success' && (
          <Notice variant="success">
            {reconciled || billing.status === 'active'
              ? 'Thanks — your subscription is active.'
              : 'Thanks — your payment is being confirmed. This page will update within a minute.'}
          </Notice>
        )}
        {checkout === 'cancelled' && <Notice variant="info">Checkout cancelled. You have not been charged.</Notice>}
        <SectionCard title="Your plan" action={<Badge tone={label.tone} dot>{label.text}</Badge>}>
          <p className="text-3xl font-semibold tracking-tight text-ink">
            {PLAN.currency}{PLAN.priceMonthly}
            <span className="text-base font-normal text-ink-3"> / month</span>
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
            {PLAN.perks.map((perk) => (
              <li key={perk}>✓ {perk}</li>
            ))}
          </ul>

          <p className="mt-5 text-sm text-ink-3">
            {billing.status === 'trial_available' &&
              'Your 30-day free trial has not started. Start it when you are ready to send your first review requests — no card needed.'}
            {billing.status === 'trialing' &&
              `${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? '' : 's'} left in your free trial.`}
            {billing.status === 'trial_expired' && 'Subscribe to keep sending review requests.'}
            {billing.status === 'active' && business.current_period_end &&
              (sub?.cancel_at_period_end
                ? `Your subscription is set to cancel. Access continues until ${fmtDate(business.current_period_end)}.`
                : `Next payment ${PLAN.currency}${PLAN.priceMonthly} on ${fmtDate(business.current_period_end)}.`)}
            {billing.status === 'past_due' && 'Your last payment failed. Update your card to avoid interruption.'}
            {billing.status === 'canceled' && 'Your subscription has ended. Resubscribe any time.'}
          </p>

          <div className="mt-5 flex flex-wrap items-start gap-3">
            {billing.status === 'trial_available' && (
              <BillingButton action={claimTrial as (p: BillingResult, f: FormData) => Promise<BillingResult>} label="Start my 30-day free trial" />
            )}
            {subscribed ? (
              <BillingButton action={openBillingPortal as (p: BillingResult, f: FormData) => Promise<BillingResult>} label="Manage billing" />
            ) : (
              <BillingButton action={startSubscription as (p: BillingResult, f: FormData) => Promise<BillingResult>} label={`Subscribe — ${PLAN.currency}${PLAN.priceMonthly}/month`} />
            )}
          </div>
        </SectionCard>

        {subscribed && (
          <SectionCard title="Payment method">
            <p className="text-sm text-ink-2">
              {paymentMethod
                ? `${paymentMethod.brand.toUpperCase()} ending ${paymentMethod.last4} · expires ${String(paymentMethod.expMonth).padStart(2, '0')}/${paymentMethod.expYear}`
                : 'No card details available.'}
            </p>
            <p className="mt-1 text-xs text-ink-3">Use Manage billing to update your card, change or cancel your plan.</p>
          </SectionCard>
        )}

        {invoices.length > 0 && (
          <SectionCard title="Recent invoices">
            <ul className="divide-y divide-line text-sm">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-ink-2">
                    {fmtDate(inv.created)}
                    {inv.number ? ` · ${inv.number}` : ''}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-ink">{money(inv.amountPaid, inv.currency)}</span>
                    <span className="text-xs capitalize text-ink-3">{inv.status}</span>
                    {inv.hostedUrl && (
                      <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline dark:text-brand-300">
                        View
                      </a>
                    )}
                    {inv.pdfUrl && (
                      <a href={inv.pdfUrl} className="text-brand-700 hover:underline dark:text-brand-300">
                        PDF
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
