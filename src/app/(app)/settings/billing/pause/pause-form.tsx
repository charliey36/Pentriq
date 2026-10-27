'use client';

import { useFormState } from 'react-dom';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { PAUSE_OPTIONS } from '@/lib/pause';
import { pauseSubscription, type BillingResult } from '../actions';

export function PauseForm() {
  const [state, formAction] = useFormState<BillingResult, FormData>(pauseSubscription, {});
  if (state.success) {
    return (
      <Notice variant="success">
        Your subscription is paused. Your customers, reviews and history are all kept, and nothing is sent until you resume. You can resume any time in Settings → Billing.
      </Notice>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">How long do you need?</legend>
        {PAUSE_OPTIONS.map((o, i) => (
          <label key={o.key} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-ink-2 ring-1 ring-inset ring-line has-[:checked]:bg-brand-500/5 has-[:checked]:ring-brand-500">
            <input type="radio" name="option" value={o.key} defaultChecked={i === 0} className="h-4 w-4" />
            {o.label}
          </label>
        ))}
      </fieldset>
      <SubmitButton pendingText="Pausing…">Pause my subscription</SubmitButton>
      {state.error && <Notice variant="error">{state.error}</Notice>}
    </form>
  );
}
