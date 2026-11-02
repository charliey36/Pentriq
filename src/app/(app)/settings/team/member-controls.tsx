'use client';

import { useState, useTransition } from 'react';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { removeTeamMember, revokeInvite, updateMemberRole } from './actions';

export function RoleSelect({ userId, role, label, canAssignAdmin }: { userId: string; role: 'admin' | 'staff'; label: string; canAssignAdmin: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label className="sr-only" htmlFor={`role-${userId}`}>Role for {label}</label>
      <select
        id={`role-${userId}`}
        defaultValue={role}
        disabled={pending}
        className="input py-1.5 text-sm"
        onChange={(e) => {
          const value = e.target.value;
          setError(null);
          start(async () => {
            const res = await updateMemberRole(userId, value);
            if (res.error) setError(res.error);
          });
        }}
      >
        <option value="staff">Staff</option>
        {(canAssignAdmin || role === 'admin') && <option value="admin" disabled={!canAssignAdmin}>Admin</option>}
      </select>
      {error && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function RemoveMemberButton({ userId, label }: { userId: string; label: string }) {
  return <ConfirmActionButton label="Remove" ariaLabel={`Remove ${label} from the team`} onConfirm={() => removeTeamMember(userId)} />;
}

export function RevokeInviteButton({ invitationId, email }: { invitationId: string; email: string }) {
  return <ConfirmActionButton label="Revoke" ariaLabel={`Revoke invitation for ${email}`} onConfirm={() => revokeInvite(invitationId)} />;
}
