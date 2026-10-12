'use client';

import { useFormState } from 'react-dom';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { deleteAccount, type DeleteAccountResult } from './actions';
import { DELETE_CONFIRMATION } from './constants';

export function DeleteAccountForm() {
  const [state, formAction] = useFormState<DeleteAccountResult, FormData>(deleteAccount, {});
  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={(e) => {
        if (!window.confirm('Permanently delete your account and all customer data? This cannot be undone.')) e.preventDefault();
      }}
    >
      <label htmlFor="confirm" className="label">
        Type {DELETE_CONFIRMATION} to confirm
      </label>
      <input id="confirm" name="confirm" autoComplete="off" required className="input max-w-xs" placeholder={DELETE_CONFIRMATION} />
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton pendingText="Deleting…" variant="secondary" className="text-red-700 dark:text-red-400">
        Delete my account
      </SubmitButton>
    </form>
  );
}
