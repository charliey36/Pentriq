'use client';

import { useEffect, useRef } from 'react';
import { useActionToast } from '@/components/toast';
import { useFormState } from 'react-dom';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { logVisit, type LogVisitResult } from './actions';
import type { Service } from '@/lib/database.types';

export function LogVisitForm({ customerId, services }: { customerId: string; services: Service[] }) {
  const boundAction = logVisit.bind(null, customerId);
  const [state, formAction] = useFormState<LogVisitResult, FormData>(boundAction, {});
  useActionToast(state, { title: 'Visit logged', description: 'Lifetime value and rebooking timing are updated.' });
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields after a successful log so the same visit isn't
  // submitted twice by accident.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_1.2fr_auto] lg:items-end"
    >
      <div>
        <label htmlFor="service_id" className="label">
          Service
        </label>
        <select id="service_id" name="service_id" className="input mt-1.5">
          <option value="">General visit</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="price" className="label">
          Price
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-4">£</span>
          <input
            id="price"
            name="price"
            type="number"
            min={0}
            step={0.01}
            className="input pl-7 tabular-nums"
            placeholder="45.00"
          />
        </div>
      </div>

      <div>
        <label htmlFor="staff_name" className="label">
          Staff member <span className="font-normal text-ink-4">(optional)</span>
        </label>
        <input id="staff_name" name="staff_name" type="text" maxLength={120} className="input mt-1.5" placeholder="e.g. Alex" />
      </div>

      <div>
        <label htmlFor="notes" className="label">
          Notes <span className="font-normal text-ink-4">(optional)</span>
        </label>
        <input id="notes" name="notes" type="text" className="input mt-1.5" placeholder="e.g. prefers mornings" />
      </div>

      <SubmitButton pendingText="Logging…" className="sm:col-span-2 lg:col-span-1">
        Log visit
      </SubmitButton>

      {state.error && <Notice variant="error" className="sm:col-span-2 lg:col-span-4">{state.error}</Notice>}
    </form>
  );
}
