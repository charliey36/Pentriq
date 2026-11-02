'use client';

import { useFormState } from 'react-dom';
import { useActionToast } from '@/components/toast';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { RETENTION_OPTIONS, describeRetention } from '@/lib/retention';
import { saveRetentionPolicy, type RetentionResult } from './actions';
import { useState } from 'react';

export function RetentionForm({ current, canEdit }: { current: number | null; canEdit: boolean }) {
  const [state, formAction] = useFormState<RetentionResult, FormData>(saveRetentionPolicy, {});
  useActionToast(state, { title: 'Retention policy saved' });
  const [value, setValue] = useState(current === null ? '' : String(current));
  const known = RETENTION_OPTIONS.some((o) => (o.days === null ? '' : String(o.days)) === value);

  return (
    <form action={formAction} className="space-y-3">
      <div className="max-w-sm">
        <label htmlFor="data_retention_days" className="label">
          Keep message history and tracking events for
        </label>
        <select
          id="data_retention_days"
          name="data_retention_days"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
          className="input mt-1.5"
        >
          {RETENTION_OPTIONS.map((o) => (
            <option key={o.label} value={o.days === null ? '' : String(o.days)}>
              {o.label}
            </option>
          ))}
          {!known && <option value={value}>{value} days</option>}
        </select>
        <p className="field-hint">{describeRetention(value === '' ? null : Number(value))} Customers, visits, private feedback and the audit log are never removed by this policy.</p>
      </div>
      {canEdit ? (
        <SubmitButton pendingText="Saving…">Save policy</SubmitButton>
      ) : (
        <p className="text-xs text-ink-3">Only the account owner can change the retention policy.</p>
      )}
      {state.error && <Notice variant="error">{state.error}</Notice>}
    </form>
  );
}
