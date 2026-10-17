'use client';

import { useFormState } from 'react-dom';
import { useActionToast } from '@/components/toast';
import type { Business } from '@/lib/database.types';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { SectionCard } from '@/components/ui/section-card';
import { SubmitButton } from '@/components/ui/submit-button';
import { saveSettings, type SaveSettingsResult } from './actions';

export function SettingsForm({ business }: { business: Business }) {
  const [state, formAction] = useFormState<SaveSettingsResult, FormData>(
    saveSettings,
    {}
  );
  useActionToast(state, { title: 'Settings saved' });

  return (
    <form action={formAction} className="space-y-6">
      <SectionCard title="Business" description="The name customers see on review request emails and feedback pages.">
        <div className="max-w-lg">
          <label htmlFor="name" className="label">
            Business name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={business.name}
            className="input mt-1.5"
            placeholder="Acme Coffee Co."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Review requests"
        description="Where customers land when they click the review button. Requests are emailed the day after a service, between 9am and 12pm."
      >
        <div className="max-w-lg space-y-6">
          <div>
            <label htmlFor="google_review_url" className="label">
              Google review URL <span className="font-normal text-ink-4">(optional)</span>
            </label>
            <input
              id="google_review_url"
              name="google_review_url"
              type="url"
              defaultValue={business.google_review_url}
              className="input mt-1.5"
              placeholder="https://g.page/r/your-place/review"
            />
            <p className="field-hint">
              Customers who click the review button in their email land here. You can add this later &mdash;
              review request emails just won&apos;t include a review link until it&apos;s set.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Booking URL"
        description="The page customers should be directed to when booking appointments."
      >
        <div className="max-w-lg space-y-3">
          <p className="text-sm font-medium text-ink">
            {business.booking_url ? '✅ Booking URL configured' : '⚠ Booking URL missing'}
          </p>
          {!business.booking_url && (
            <Notice variant="warning">Add your booking link so customers can book directly from rebooking emails.</Notice>
          )}
          <div>
            <label htmlFor="booking_url" className="label">
              Booking URL <span className="font-normal text-ink-4">(recommended)</span>
            </label>
            <input
              id="booking_url"
              name="booking_url"
              type="url"
              defaultValue={business.booking_url ?? ''}
              className="input mt-1.5"
              placeholder="https://business.com/book"
            />
            <p className="field-hint">
              e.g. https://business.com/book, https://booking.squareup.com/..., https://bookings.gettimely.com/...,
              https://business.cliniko.com/bookings
            </p>
          </div>
          {business.booking_url && (
            <dl className="text-[13px] text-ink-3">
              <div>Current: <span className="break-all text-ink-2">{business.booking_url}</span></div>
              <div>Validation: ✅ Valid web address</div>
              {business.booking_url_updated_at && (
                <div>Last updated: {new Date(business.booking_url_updated_at).toLocaleDateString('en-GB')}</div>
              )}
            </dl>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Service timing"
        description="Review requests are emailed the day after a service, and all customer emails go out between 9am and 12pm UK time."
      >
        <div className="grid max-w-lg gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="review_request_window_days" className="label">Review request window (days)</label>
            <input id="review_request_window_days" name="review_request_window_days" type="number" min={1} max={365} required
              defaultValue={business.review_request_window_days ?? 14} className="input mt-1.5 tabular-nums" />
            <p className="field-hint">Only customers serviced within this many days get review requests.</p>
          </div>
          <div>
            <label htmlFor="rebooking_reminder_interval_days" className="label">Rebooking reminder after (days)</label>
            <input id="rebooking_reminder_interval_days" name="rebooking_reminder_interval_days" type="number" min={1} max={730} required
              defaultValue={business.rebooking_reminder_interval_days ?? 90} className="input mt-1.5 tabular-nums" />
            <p className="field-hint">Days after a customer's last service before we email them to rebook.</p>
          </div>
          <label className="flex items-start gap-3 text-sm text-ink-2 sm:col-span-2">
            <input type="checkbox" name="rebooking_reminders_enabled" defaultChecked={business.rebooking_reminders_enabled ?? true}
              className="mt-1 h-4 w-4 rounded border-line-strong" />
            <span>
              <span className="font-medium text-ink">Send rebooking reminders</span>
              <span className="block text-[13px] text-ink-3">Untick if you do not want Pentriq to email customers asking them to book again.</span>
            </span>
          </label>
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingText="Saving…" icon={<Icon name="check" className="h-4 w-4" strokeWidth={2.2} />}>
          Save changes
        </SubmitButton>
        {state.error && <Notice variant="error">{state.error}</Notice>}
      </div>
    </form>
  );
}
