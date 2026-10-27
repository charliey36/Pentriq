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
import { FREQUENCY_PRESETS, frequencyChoice } from '@/lib/safeguards';
import {
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  SAMPLE_VALUES,
  TEMPLATE_LIMITS,
  TEMPLATE_VARIABLES,
  missingValues,
  renderTemplateText,
  validateTemplate,
} from '@/lib/message-template';
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
  const [cooldownDays, setCooldownDays] = useState(String(business.review_cooldown_days ?? 30));
  const [freqChoice, setFreqChoice] = useState(frequencyChoice(business.review_cooldown_days ?? 30));

  const [subject, setSubject] = useState(business.review_message_subject ?? '');
  const [body, setBody] = useState(business.review_message_body ?? '');
  const [previewMissing, setPreviewMissing] = useState(false);
  const templateCheck = validateTemplate(subject, body);
  // Preview with sample data, or with the details a customer might not have (to show the fallbacks).
  const previewValues = previewMissing ? { customerName: '', serviceName: '', staffName: '', appointmentDate: '', businessName: business.name } : { ...SAMPLE_VALUES, businessName: business.name || SAMPLE_VALUES.businessName };
  const previewSubject = renderTemplateText(subject.trim() || DEFAULT_SUBJECT, previewValues);
  const previewBody = renderTemplateText(body.trim() || DEFAULT_BODY, previewValues);
  const usedFallbacks = missingValues(`${subject} ${body}`, previewValues);

  return (
    <form id="business-settings-form" action={formAction} onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="quick_win_settings" value="1" />

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
          <div className="md:col-span-2 md:max-w-[calc(50%-0.625rem)]">
            <label htmlFor="contact_email" className="label">Business Contact Email <span className="font-normal text-ink-4">(optional)</span></label>
            <input id="contact_email" name="contact_email" type="email" autoComplete="email" maxLength={254} defaultValue={business.contact_email ?? ''}
              aria-invalid={Boolean(state.fieldErrors?.contact_email)} aria-describedby="contact_email_msg"
              className={`input mt-1.5 ${state.fieldErrors?.contact_email ? 'border-red-500 hover:border-red-500 focus:border-red-500' : ''}`} placeholder="support@yourbusiness.com" />
            {state.fieldErrors?.contact_email
              ? <p id="contact_email_msg" role="alert" className="mt-1.5 text-xs leading-5 text-red-600 dark:text-red-400">{state.fieldErrors.contact_email}</p>
              : <p id="contact_email_msg" className="field-hint">Customers will see this email address in Pentriq emails if they need assistance. Leave blank to hide the support section.</p>}
          </div>
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
            <div className={cooldownOn ? 'mt-4 grid w-full gap-4 sm:max-w-md sm:grid-cols-2' : 'hidden'}>
              <div>
                <label htmlFor="review_cooldown_choice" className="label">Maximum one request every</label>
                <select id="review_cooldown_choice" value={freqChoice} className="input mt-1.5"
                  onChange={(e) => {
                    setFreqChoice(e.target.value);
                    if (e.target.value !== 'custom') setCooldownDays(e.target.value);
                  }}>
                  {FREQUENCY_PRESETS.map((d) => <option key={d} value={d}>{d} days</option>)}
                  <option value="custom">Custom…</option>
                </select>
              </div>
              <div>
                <label htmlFor="review_cooldown_days" className="label">Cooldown period (days)</label>
                <input id="review_cooldown_days" name="review_cooldown_days" type="number" min={1} max={365} required={cooldownOn}
                  value={cooldownDays} onChange={(e) => { setCooldownDays(e.target.value); setFreqChoice(frequencyChoice(Number(e.target.value))); }}
                  className="input mt-1.5 tabular-nums" />
              </div>
              <p className="field-hint sm:col-span-2">Customers must wait this many days before receiving another review request. New accounts start with 30 days.</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Reminders and emails" description="Control the follow-ups customers receive and the summary you receive.">
        <div className="max-w-2xl space-y-4">
          <label className="flex items-start gap-3 text-sm text-ink-2">
            <input type="checkbox" name="review_reminders_enabled" defaultChecked={business.review_reminders_enabled ?? true} className="mt-1 h-4 w-4 rounded border-line-strong" />
            <span>
              <span className="font-medium text-ink">Send automatic review reminders</span>
              <span className="block text-[13px] text-ink-3">If a customer has not left a review, they get one reminder after 3 days and a final reminder after 7 days. Reminders stop as soon as they follow your review link, send private feedback or unsubscribe.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-ink-2">
            <input type="checkbox" name="weekly_summary_enabled" defaultChecked={business.weekly_summary_enabled ?? true} className="mt-1 h-4 w-4 rounded border-line-strong" />
            <span>
              <span className="font-medium text-ink">Email me a weekly performance summary</span>
              <span className="block text-[13px] text-ink-3">Every Monday: reviews gained, total reviews, average rating, requests sent and conversion rate.</span>
            </span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Personalise your review request" description="Optional. Customise the subject and opening message of the first email. Leave blank to use the standard wording.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="review_message_subject" className="label">Subject</label>
              <input id="review_message_subject" name="review_message_subject" type="text" maxLength={TEMPLATE_LIMITS.subjectMax} value={subject}
                onChange={(e) => setSubject(e.target.value)} placeholder={DEFAULT_SUBJECT} className="input mt-1.5" />
            </div>
            <div>
              <label htmlFor="review_message_body" className="label">Opening message</label>
              <textarea id="review_message_body" name="review_message_body" rows={4} maxLength={TEMPLATE_LIMITS.bodyMax} value={body}
                onChange={(e) => setBody(e.target.value)} placeholder={DEFAULT_BODY} className="input mt-1.5" />
              <p className="field-hint">The review and private feedback buttons are always added for you.</p>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Available variables">
              {TEMPLATE_VARIABLES.map((v) => (
                <button key={v.key} type="button" className="btn btn-secondary btn-sm" title={`Add ${v.label} (shows "${v.fallback}" if unknown)`}
                  onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}{{${v.key}}}`)}>
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
            {!templateCheck.ok && (
              <ul role="alert" className="space-y-1 text-xs leading-5 text-red-600 dark:text-red-400">
                {templateCheck.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="label">Preview</p>
              <label className="flex items-center gap-2 text-xs text-ink-3">
                <input type="checkbox" checked={previewMissing} onChange={(e) => setPreviewMissing(e.target.checked)} className="h-3.5 w-3.5 rounded border-line-strong" />
                Customer details missing
              </label>
            </div>
            <div className="mt-1.5 rounded-xl bg-surface-subtle p-4 ring-1 ring-inset ring-line">
              <p className="text-xs text-ink-3">Subject</p>
              <p className="text-sm font-semibold text-ink">{previewSubject}</p>
              <p className="mt-3 text-sm leading-6 text-ink-2">{previewBody}</p>
              <p className="mt-3 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Leave a Review</p>
            </div>
            {usedFallbacks.length > 0 && (
              <p className="field-hint">Where a detail is unknown, a friendly default is used instead: {TEMPLATE_VARIABLES.filter((v) => usedFallbacks.includes(v.key)).map((v) => `${v.label} → “${v.fallback}”`).join(', ')}.</p>
            )}
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
