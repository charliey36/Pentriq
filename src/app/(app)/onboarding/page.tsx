import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { getBillingState } from '@/lib/billing';
import { BillingButton } from '../settings/billing/billing-button';
import { claimTrial, type BillingResult } from '../settings/billing/actions';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = { title: 'Get started' };

export default async function OnboardingPage() {
  const business = await requireBusiness();
  const billing = getBillingState(business);
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Send your first review request</h1>
      <p className="mt-2 text-sm text-ink-3">Two minutes, one form. No setup needed beyond this.</p>
      {billing.status === 'trial_available' && (
        <div className="card mt-6 space-y-3 p-5">
          <p className="text-sm font-medium text-ink">Start your free trial to send</p>
          <p className="text-sm text-ink-3">
            Your 30-day trial begins when you start it, not when you signed up, and no card is needed. You can fill in
            the form below first; the request is sent once your trial has started.
          </p>
          <BillingButton action={claimTrial as (p: BillingResult, f: FormData) => Promise<BillingResult>} label="Start my 30-day free trial" />
        </div>
      )}
      <OnboardingForm defaultName={business.name === 'My Business' ? '' : business.name} defaultUrl={business.google_review_url} defaultBookingUrl={business.booking_url ?? ''} />

      <div className="mt-6 flex flex-col items-center gap-2 border-t border-line pt-6 text-center">
        <Link href="/dashboard" className="btn btn-secondary">
          Skip for now &mdash; go to dashboard
        </Link>
        <p className="max-w-sm text-[13px] leading-5 text-ink-3">
          You can import customers, add your review link and send your first request whenever you&apos;re ready. We&apos;ll keep
          these steps on your dashboard.
        </p>
      </div>
    </div>
  );
}
