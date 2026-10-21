'use client';

import { useMemo, useRef, useState } from 'react';
import { SectionCard } from '@/components/ui/section-card';
import {
  PLACEHOLDER_REVIEW_URL,
  REVIEW_PLATFORMS,
  resolveReviewLink,
  type ReviewPlatformId,
} from '@/lib/email-templates/review-destinations';
import {
  renderReviewRequestEmail,
  type ReviewEmailVariant,
} from '@/lib/email-templates/review-request';

type Viewport = 'desktop' | 'mobile';
type Tab = 'html' | 'text';

const SAMPLE_FEEDBACK_URL = 'https://example.com/feedback/sample';
const SAMPLE_UNSUBSCRIBE_URL = 'https://example.com/unsubscribe/sample';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface-subtle p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
              active ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Live preview of the exact HTML/plain-text the review request email sends.
 * It calls the same renderReviewRequestEmail() used by the send pipeline, so
 * what you see here is what customers receive.
 */
export function EmailPreview({ defaultBusinessName }: { defaultBusinessName: string }) {
  const [variant, setVariant] = useState<ReviewEmailVariant>('request');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [tab, setTab] = useState<Tab>('html');
  const [customerName, setCustomerName] = useState('Alex Morgan');
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [reviewUrl, setReviewUrl] = useState(PLACEHOLDER_REVIEW_URL);
  const [platform, setPlatform] = useState<ReviewPlatformId | ''>('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [frameHeight, setFrameHeight] = useState(820);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const email = useMemo(
    () =>
      renderReviewRequestEmail({
        variant,
        customerName,
        businessName,
        reviewLink: resolveReviewLink({ url: reviewUrl }),
        reviewPlatform: platform || undefined,
        privateFeedbackUrl: SAMPLE_FEEDBACK_URL,
        unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL,
        businessContact: { email: contactEmail, phone: contactPhone },
        appUrl: '', // relative: the logo is served by this same app
      }),
    [variant, customerName, businessName, reviewUrl, platform, contactEmail, contactPhone]
  );

  function syncFrameHeight() {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setFrameHeight(Math.max(480, doc.documentElement.scrollHeight));
  }

  function simulateMissingValues() {
    setCustomerName('');
    setBusinessName('');
    setReviewUrl('');
    setContactEmail('');
    setContactPhone('');
  }

  function resetValues() {
    setCustomerName('Alex Morgan');
    setBusinessName(defaultBusinessName);
    setReviewUrl(PLACEHOLDER_REVIEW_URL);
    setContactEmail('');
    setContactPhone('');
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <SectionCard
        title="Variables"
        description="Change the values to see how the email adapts. Empty values use graceful fallbacks."
        className="h-fit"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="pv-customer" className="label">
              <code className="text-[12px]">{'{{customerName}}'}</code>
            </label>
            <input
              id="pv-customer"
              className="input mt-1.5"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Alex Morgan"
            />
          </div>
          <div>
            <label htmlFor="pv-business" className="label">
              <code className="text-[12px]">{'{{businessName}}'}</code>
            </label>
            <input
              id="pv-business"
              className="input mt-1.5"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Acme Coffee Co."
            />
          </div>
          <div>
            <label htmlFor="pv-review" className="label">
              <code className="text-[12px]">{'{{reviewLink}}'}</code>
            </label>
            <input
              id="pv-review"
              className="input mt-1.5"
              value={reviewUrl}
              onChange={(e) => setReviewUrl(e.target.value)}
              placeholder={PLACEHOLDER_REVIEW_URL}
              inputMode="url"
            />
            <p className="field-hint">
              Empty or invalid: the button is replaced by the private feedback action. Real sends never
              use the example.com placeholder.
            </p>
          </div>
          <div>
            <label htmlFor="pv-platform" className="label">
              Review destination <span className="font-normal text-ink-4">(optional note)</span>
            </label>
            <select
              id="pv-platform"
              className="input mt-1.5"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ReviewPlatformId | '')}
            >
              <option value="">None</option>
              {(Object.keys(REVIEW_PLATFORMS) as ReviewPlatformId[]).map((id) => (
                <option key={id} value={id}>
                  {REVIEW_PLATFORMS[id].label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <label htmlFor="pv-email" className="label">
                Contact email <span className="font-normal text-ink-4">(optional)</span>
              </label>
              <input
                id="pv-email"
                type="email"
                className="input mt-1.5"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="hello@acme.co"
              />
            </div>
            <div>
              <label htmlFor="pv-phone" className="label">
                Contact phone <span className="font-normal text-ink-4">(optional)</span>
              </label>
              <input
                id="pv-phone"
                type="tel"
                className="input mt-1.5"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="020 7946 0000"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn btn-secondary btn-sm" onClick={simulateMissingValues}>
              Simulate missing values
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetValues}>
              Reset
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Email type"
              value={variant}
              onChange={setVariant}
              options={[
                { value: 'request', label: 'Request' },
                { value: 'reminder', label: 'Reminder' },
              ]}
            />
            <Segmented
              label="Preview mode"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'html', label: 'Rendered' },
                { value: 'text', label: 'Plain text' },
              ]}
            />
          </div>
          {tab === 'html' && (
            <Segmented
              label="Viewport"
              value={viewport}
              onChange={setViewport}
              options={[
                { value: 'desktop', label: 'Desktop' },
                { value: 'mobile', label: 'Mobile (375px)' },
              ]}
            />
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-1 border-b border-line bg-surface-subtle px-5 py-3 text-[13px] sm:px-6">
          <div className="flex gap-3">
            <dt className="w-20 flex-shrink-0 text-ink-3">Subject</dt>
            <dd className="min-w-0 break-words font-medium text-ink">{email.subject}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 flex-shrink-0 text-ink-3">Preview text</dt>
            <dd className="min-w-0 break-words text-ink-2">{email.preheader}</dd>
          </div>
        </dl>

        {tab === 'html' ? (
          <div className="overflow-x-auto bg-app p-4 sm:p-6">
            <iframe
              ref={frameRef}
              key={viewport}
              title="Review request email preview"
              srcDoc={email.html}
              // No scripts; same-origin only so we can measure the document height.
              sandbox="allow-same-origin"
              onLoad={syncFrameHeight}
              style={{ height: frameHeight }}
              className={`mx-auto block w-full rounded-xl border border-line bg-white shadow-card ${
                viewport === 'mobile' ? 'max-w-[375px]' : 'max-w-[720px]'
              }`}
            />
          </div>
        ) : (
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-6 text-ink-2 sm:p-6">
            {email.text}
          </pre>
        )}
      </SectionCard>
    </div>
  );
}
