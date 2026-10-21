'use client';

import { useState } from 'react';
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
  const [cooldownOn, setCooldownOn] = useState(business.review_cooldown_enabled ?? false);

  return (
    <form id="business-settings-form" action={formAction} className="space-y-6">

      <SectionCard title="Customer links" description="Add the links customers use to leave a review or book their next visit.">
        <div className="grid max-w-3xl gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="google_review_url" className="label">Google review URL <span className="font-normal text-ink-4">(optional)</span></label>
            <input id="google_review_url" name="google_review_url" type="url" defaultValue={business.google_review_url} className="input mt-1.5" placeholder="https://g.page/r/your-place/review" />
            <p className="field-hint">Customers use this link to leave a review.</p>
          </div>
          <div>
            <label htmlFor="booking_url" className="label">Booking URL <span className="font-normal text-ink-4">(optional)</span></label>
            <input id="booking_url" name="booking_url" type="url" defaultValue={business.booking_url ?? ''} className="input mt-1.5" placeholder="https://business.com/book" />
            <p className="field-hint">Customers use this link to book again.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Service timing"
        description="Review requests are sent automatically at 8:00am the day after a completed service."
      >
        <div className="grid max-w-lg gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="review_request_window_days" className="label">Review request window (days)</label>
            <input id="review_request_window_days" name="review_request_window_days" type="number" min={1} max={365} required
              defaultValue={business.review_request_window_days ?? 1} className="input mt-1.5 tabular-nums" />
            <p className="field-hint">Only customers serviced within this many days get review requests.</p>
          </div>
          <div>
            <label htmlFor="rebooking_reminder_interval_days" className="label">Rebooking reminder after (days)</label>
            <input id="rebooking_reminder_interval_days" name="rebooking_reminder_interval_days" type="number" min={1} max={730} required
              defaultValue={business.rebooking_reminder_interval_days ?? 30} className="input mt-1.5 tabular-nums" />
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

          <div className="sm:col-span-2">
            <label className="flex items-start gap-3 text-sm text-ink-2">
              <input type="checkbox" name="review_cooldown_enabled" checked={cooldownOn} onChange={(e) => setCooldownOn(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-line-strong" />
              <span>
                <span className="font-medium text-ink">Limit repeat review requests</span>
                <span className="block text-[13px] text-ink-3">When enabled, customers will only receive another review request if they have used your service again AND the cooldown period has expired.</span>
                <span className="mt-1 block text-[13px] text-ink-4">Useful for businesses that want fresh reviews without repeatedly asking the same customers after every visit.</span>
              </span>
            </label>
            {/* Always in the form (just hidden while off) so the saved number is kept when the toggle is off. */}
            <div className={cooldownOn ? 'mt-4 w-full sm:w-52' : 'hidden'}>
              <label htmlFor="review_cooldown_days" className="label">Cooldown period (days)</label>
              <input id="review_cooldown_days" name="review_cooldown_days" type="number" min={1} max={365} required={cooldownOn}
                defaultValue={business.review_cooldown_days ?? 60} className="input mt-1.5 tabular-nums" />
              <p className="field-hint">Customers must wait this many days before receiving another review request.</p>
            </div>
          </div>
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
