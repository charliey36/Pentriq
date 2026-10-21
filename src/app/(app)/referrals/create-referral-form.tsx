'use client';

import { useFormState } from 'react-dom';
import type { Customer, ReferralPromotion } from '@/lib/database.types';
import { CopyButton } from '@/components/ui/copy-button';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { createReferralCode, sendReferralInvitation, type ReferralFormResult } from './actions';

export function CreateReferralForm({ customers, promotions }: { customers: Customer[]; promotions: ReferralPromotion[] }) {
  const [state, formAction] = useFormState<ReferralFormResult, FormData>(createReferralCode, {});

  return (
    <div>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="customer_id" className="label">
            Referring customer
          </label>
          <select id="customer_id" name="customer_id" required className="input mt-1.5" defaultValue="">
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} ({customer.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="promotion_id" className="label">
            Referral Promotion
          </label>
          <select id="promotion_id" name="promotion_id" required className="input mt-1.5" defaultValue="">
            <option value="" disabled>
              {promotions.length ? 'Select a promotion…' : 'No promotions yet — create one in Loyalty Program settings'}
            </option>
            {promotions.map((promotion) => (
              <option key={promotion.id} value={promotion.id}>
                {promotion.name}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton pendingText="Generating…">Generate code</SubmitButton>
      </form>

      {state.error && <Notice variant="error" className="mt-4">{state.error}</Notice>}
      {state.success && state.code && (
        <Notice variant="success" className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span>Referral code: <span className="font-mono font-semibold tracking-wide">{state.code}</span></span>
            <CopyButton value={state.code} />
            {state.qrUrl && <img src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(state.qrUrl)}`} alt="Referral QR code" width={96} height={96} className="rounded bg-white p-1" />}
            <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { const result = await sendReferralInvitation(state.code!); if (result.error) alert(result.error); else alert('Referral email sent.'); }}>Send referral email</button>
          </div>
        </Notice>
      )}
    </div>
  );
}
