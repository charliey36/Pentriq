'use client';

import { useEffect, useRef } from 'react';
import { useActionToast } from '@/components/toast';
import { useFormState } from 'react-dom';
import { Notice } from '@/components/ui/notice';
import { Icon } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/submit-button';
import { addCustomer, type AddCustomerResult } from './actions';
import { CONSENT_FIELD, CONSENT_LABEL } from '@/lib/consent';

export function AddCustomerForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [state, formAction] = useFormState<AddCustomerResult, FormData>(
    addCustomer,
    {}
  );
  useActionToast(state, { title: 'Customer added', description: 'No email is sent until you log their first visit.' });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
    >
      <div>
        <label htmlFor="name" className="label">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus={autoFocus}
          autoComplete="off"
          className="input mt-1.5"
          placeholder="Jane Doe"
        />
      </div>

      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          className="input mt-1.5"
          placeholder="jane@example.com"
        />
      </div>

      <div>
        <label htmlFor="phone" className="label">
          Phone <span className="font-normal text-ink-4">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="off"
          className="input mt-1.5"
          placeholder="+1 555 123 4567"
        />
      </div>

      <div>
        <label htmlFor="last_service_date" className="label">
          Last service <span className="font-normal text-ink-4">(optional)</span>
        </label>
        <input id="last_service_date" name="last_service_date" type="date" className="input mt-1.5" />
      </div>

      <SubmitButton
        pendingText="Adding…"
        icon={<Icon name="plus" className="h-4 w-4" strokeWidth={2} />}
        className="sm:col-span-2 lg:col-span-1"
      >
        Add customer
      </SubmitButton>

      <label className="flex items-start gap-3 text-sm text-ink-2 sm:col-span-2 lg:col-span-5">
        <input type="checkbox" name={CONSENT_FIELD} required className="mt-1 h-4 w-4 rounded border-line-strong" />
        <span>{CONSENT_LABEL}</span>
      </label>

      {state.error && <Notice variant="error" className="sm:col-span-2 lg:col-span-4">{state.error}</Notice>}
    </form>
  );
}
