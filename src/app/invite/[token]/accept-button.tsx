'use client';

import { useFormState } from 'react-dom';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { acceptInvite, type AcceptResult } from './actions';

export function AcceptButton({ token }: { token: string }) {
  const [state, formAction] = useFormState<AcceptResult, FormData>(acceptInvite.bind(null, token), {});
  return (
    <form action={formAction} className="space-y-4">
      <div aria-live="polite">{state.error && <Notice variant="error">{state.error}</Notice>}</div>
      <SubmitButton pendingText="Joining…" className="btn-lg w-full">Accept invitation</SubmitButton>
    </form>
  );
}
