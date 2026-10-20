'use client';

import { useState } from 'react';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { redeemReferralCode, validateReferralCode, type ReferralValidation } from './actions';

export function ValidateReferralForm() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ReferralValidation | null>(null);
  const [pending, setPending] = useState(false);
  async function validate() { setPending(true); setResult(await validateReferralCode(code)); setPending(false); }
  async function redeem() { if (!result?.id) return; setPending(true); const response = await redeemReferralCode(result.id); setResult(response.error ? { error: response.error } : { valid: false }); setPending(false); }
  return <div className="space-y-4">
    <div><label htmlFor="validate-code" className="label">Referral code</label><div className="flex gap-2"><input id="validate-code" value={code} onChange={(e) => setCode(e.target.value)} className="input mt-1.5 font-mono" placeholder="R7K2PX9Q" /><button type="button" onClick={validate} disabled={pending || !code} className="btn btn-secondary mt-1.5">{pending ? <Spinner /> : 'Validate'}</button></div></div>
    {result?.error && <Notice variant="error">❌ {result.error}</Notice>}
    {result?.valid && <Notice variant="success"><div className="space-y-2"><p>✅ Valid Referral Code</p><p>Referrer: <strong>{result.referrerName}</strong></p><p>Reward for new customer: <strong>{result.newCustomerReward}</strong></p><p>Reward for referrer: <strong>{result.referralReward}</strong></p><button type="button" onClick={redeem} disabled={pending} className="btn btn-primary">{pending ? 'Redeeming…' : 'Mark as redeemed'}</button></div></Notice>}
  </div>;
}
