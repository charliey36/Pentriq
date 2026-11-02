import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { getBillingState } from '@/lib/billing';
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
        <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm text-ink-2">
          Your 30-day free trial starts automatically when you send this first request. No card needed.
        </p>
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
