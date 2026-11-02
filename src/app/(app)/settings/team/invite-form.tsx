'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { useActionToast } from '@/components/toast';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { inviteMember, type TeamActionResult } from './actions';

export function InviteForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  const [state, formAction] = useFormState<TeamActionResult, FormData>(inviteMember, {});
  useActionToast(state, { title: 'Invitation sent' });
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-[1.6fr_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="invite-email" className="label">Email address</label>
        <input id="invite-email" name="email" type="email" required autoComplete="off" className="input mt-1.5" placeholder="colleague@yourbusiness.com" />
      </div>
      <div>
        <label htmlFor="invite-role" className="label">Role</label>
        <select id="invite-role" name="role" defaultValue="staff" className="input mt-1.5">
          <option value="staff">Staff</option>
          {canInviteAdmin && <option value="admin">Admin</option>}
        </select>
      </div>
      <SubmitButton pendingText="Sending…" icon={<Icon name="userPlus" className="h-4 w-4" strokeWidth={2} />}>
        Send invitation
      </SubmitButton>
      <div aria-live="polite" className="sm:col-span-3">
        {state.error && <Notice variant="error">{state.error}</Notice>}
      </div>
    </form>
  );
}
