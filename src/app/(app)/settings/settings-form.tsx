'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useFormState } from 'react-dom';
import { useActionToast } from '@/components/toast';
import type { Business } from '@/lib/database.types';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { SectionCard } from '@/components/ui/section-card';
import { SubmitButton } from '@/components/ui/submit-button';
import { validateRequiredUrls, type UrlFieldErrors } from '@/lib/settings-validation';
import { saveSettings, type SaveSettingsResult } from './actions';

const URL_FIELDS = ['google_review_url', 'booking_url'] as const;

function focusFirstInvalid(errors: UrlFieldErrors) {
  const first = URL_FIELDS.find((f) => errors[f]);
  if (first) document.getElementById(first)?.focus();
}

function StatusLine({ ok, okText, missingText }: { ok: boolean; okText: string; missingText: string }) {
  return (
    <li className={ok ? 'text-brand-700 dark:text-brand-300' : 'text-amber-700 dark:text-amber-300'}>
      {ok ? '\u2713' : '\u26A0'} {ok ? okText : missingText}
    </li>
  );
}

export function SettingsForm({ business }: { business: Business }) {
  const [state, formAction] = useFormState<SaveSettingsResult, FormData>(
    saveSettings,
    {}
  );
  useActionToast(state, { title: 'Settings saved' });
  // Both links are mandatory. Existing businesses with an empty value load normally but show the error straight away.
  const [urls, setUrls] = useState({ google_review_url: business.google_review_url ?? '', booking_url: business.booking_url ?? '' });
  const [errors, setErrors] = useState<UrlFieldErrors>(() => validateRequiredUrls({ google_review_url: business.google_review_url ?? '', booking_url: business.booking_url ?? '' }));
  const current = validateRequiredUrls(urls);

  useEffect(() => {
    if (state.fieldErrors) {
      setErrors(state.fieldErrors);
      focusFirstInvalid(state.fieldErrors);
    }
  }, [state]);

  function onUrlChange(field: (typeof URL_FIELDS)[number], value: string) {
    setUrls((u) => ({ ...u, [field]: value }));
    // Clear a field's error as soon as it becomes valid; new errors appear on blur/save.
    setErrors((e) => (e[field] && !validateRequiredUrls({ ...urls, [field]: value })[field] ? { ...e, [field]: undefined } : e));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (Object.keys(current).length > 0) {
      e.preventDefault();
      setErrors(current);
      focusFirstInvalid(current);
    }
  }

  const [cooldownOn, setCooldownOn] = useState(business.review_cooldown_enabled ?? false);

  return (
    <form id="business-settings-form" action={formAction} onSubmit={onSubmit} className="space-y-6">

      <SectionCard title="Customer links" description="Add the links customers use to leave a review or book their next visit.">
        <div className="grid max-w-3xl gap-5 md:grid-cols-2">
          {([
            ['google_review_url', 'Google Review URL', 'The link customers use to leave a review.', 'https://g.page/r/your-place/review'],
            ['booking_url', 'Booking URL', 'The link customers use to book their next appointment.', 'https://business.com/book'],
          ] as const).map(([field, label, hint, placeholder]) => (
            <div key={field}>
              <label htmlFor={field} className="label">{label} <span className="text-red-600" aria-hidden="true">*</span></label>
              <input id={field} name={field} type="text" inputMode="url" autoComplete="url" value={urls[field]} placeholder={placeholder}
                onChange={(e) => onUrlChange(field, e.target.value)}
                onBlur={() => setErrors((er) => ({ ...er, [field]: current[field] }))}
                aria-required="true" aria-invalid={Boolean(errors[field])} aria-describedby={`${field}_msg`}
                className={`input mt-1.5 ${errors[field] ? 'border-red-500 hover:border-red-500 focus:border-red-500' : ''}`} />
              {errors[field]
                ? <p id={`${field}_msg`} role="alert" className="mt-1.5 text-xs leading-5 text-red-600 dark:text-red-400">{errors[field]}</p>
                : <p id={`${field}_msg`} className="field-hint">{hint}</p>}
            </div>
          ))}
        </div>

        <div className="mt-5 max-w-3xl rounded-xl bg-surface-muted px-4 py-3 text-[13px] ring-1 ring-inset ring-line">
          <p className="font-medium text-ink">Setup status</p>
          <ul className="mt-1 space-y-0.5">
            <StatusLine ok={!current.google_review_url} okText="Review URL Configured" missingText="Review URL Missing" />
            <StatusLine ok={!current.booking_url} okText="Booking URL Configured" missingText="Booking URL Missing" />
          </ul>
        </div>
      </SectionCard>

      <SectionCard
        title="Service timing"
        description="Review requests are sent automatically at 8:00am, this many days after a completed service."
      >
        <div className="grid max-w-lg gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="review_request_window_days" className="label">Review request window (days)</label>
            <input id="review_request_window_days" name="review_request_window_days" type="number" min={1} max={365} required
              defaultValue={business.review_request_window_days ?? 1} className="input mt-1.5 tabular-nums" />
            <p className="field-hint">Review requests are emailed this many days after the service. Services older than this are not requested.</p>
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
