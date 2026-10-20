'use client';

import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { deleteReferral } from './actions';

export function DeleteReferralButton({ referralId }: { referralId: string }) {
  return (
    <ConfirmActionButton
      label="Delete"
      confirmLabel="Delete"
      ariaLabel="Delete referral"
      onConfirm={() => deleteReferral(referralId)}
    />
  );
}
