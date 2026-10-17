'use client';

import { useFormState } from 'react-dom';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { completeOnboarding, type OnboardingResult } from './actions';
import { CONSENT_FIELD, CONSENT_LABEL } from '@/lib/consent';

export function OnboardingForm({ defaultName, defaultUrl, defaultBookingUrl = '' }: { defaultName: string; defaultUrl: string; defaultBookingUrl?: string }) {
  const [state, formAction] = useFormState<OnboardingResult, FormData>(completeOnboarding, {});
  return (
    <form action={formAction} className="card mt-6 space-y-5 p-6">
      <div>
        <label htmlFor="name" className="label">1. Your business name</label>
        <input id="name" name="name" required defaultValue={defaultName} className="input mt-1.5" placeholder="Smith & Sons Garage" />
      </div>
      <div>
        <label htmlFor="google_review_url" className="label">2. Your Google review link</label>
        <input id="google_review_url" name="google_review_url" type="url" required defaultValue={defaultUrl} className="input mt-1.5" placeholder="https://g.page/r/..." />
        <p className="mt-1.5 text-xs text-ink-4">
          Find it in Google Business Profile → “Get more reviews” → copy link.
        </p>
      </div>
      <div>
        <label htmlFor="booking_url" className="label">Booking URL <span className="font-normal text-ink-4">(optional)</span></label>
        <input id="booking_url" name="booking_url" type="url" defaultValue={defaultBookingUrl} className="input mt-1.5" placeholder="https://business.com/book" />
        <p className="mt-1.5 text-xs text-ink-4">The page customers should be directed to when booking appointments.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="customer_name" className="label">3. Customer name</label>
          <input id="customer_name" name="customer_name" required className="input mt-1.5" placeholder="Jane Doe" />
        </div>
        <div>
          <label htmlFor="customer_email" className="label">Customer email</label>
          <input id="customer_email" name="customer_email" type="email" required className="input mt-1.5" placeholder="jane@example.com" />
        </div>
      </div>
      <label className="flex items-start gap-3 text-sm text-ink-2">
        <input type="checkbox" name={CONSENT_FIELD} required className="mt-1 h-4 w-4 rounded border-line-strong" />
        <span>{CONSENT_LABEL}</span>
      </label>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton pendingText="Sending…">Send my first review request</SubmitButton>
    </form>
  );
}
