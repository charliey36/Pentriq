'use client';

import { useState } from 'react';
import type { Customer } from '@/lib/database.types';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { useToast } from '@/components/toast';
import { redeemReferralCode } from './actions';

export function RedeemReferralForm({ customers }: { customers: Customer[] }) {
  const [code, setCode] = useState('');
  const [refereeId, setRefereeId] = useState('');
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMessage(null);
        const result = await redeemReferralCode(code);
        if (result?.error) {
          setMessage({ type: 'error', text: result.error });
        } else {
          toast.push({ variant: 'success', title: 'Referral redeemed', description: 'Both customers have been rewarded.' });
          setCode('');
          setRefereeId('');
        }
        setPending(false);
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="code" className="label">
          Referral code
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoComplete="off"
          className="input mt-1.5 font-mono uppercase tracking-wider"
          placeholder="ABC123"
        />
      </div>
      <div>
        <label htmlFor="referee" className="label">
          New customer
        </label>
        <select
          id="referee"
          value={refereeId}
          onChange={(e) => setRefereeId(e.target.value)}
          required
          className="input mt-1.5"
        >
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

      <button type="submit" disabled={pending} aria-busy={pending} className="btn btn-secondary">
        {pending ? (
          <>
            <Spinner />
            Redeeming…
          </>
        ) : (
          'Redeem code'
        )}
      </button>

      {message && <Notice variant={message.type}>{message.text}</Notice>}
    </form>
  );
}
