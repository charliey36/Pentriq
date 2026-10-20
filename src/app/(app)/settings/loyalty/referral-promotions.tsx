'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { useActionToast } from '@/components/toast';
import type { ReferralPromotion } from '@/lib/database.types';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { Notice } from '@/components/ui/notice';
import { SectionCard } from '@/components/ui/section-card';
import { createReferralPromotion, deleteReferralPromotion, type LoyaltyFormResult } from './actions';

export function ReferralPromotions({ promotions }: { promotions: ReferralPromotion[] }) {
  const [state, formAction] = useFormState<LoyaltyFormResult, FormData>(createReferralPromotion, {});
  useActionToast(state, { title: 'Promotion created' });
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <SectionCard title="Referral Promotions" description="The promotion name is the offer your referred customer sees. Deleting a promotion does not change referrals that already used it.">
      <form id="promotion-form" ref={formRef} action={formAction} />
      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="promo_name" className="label">Promotion name</label>
          <input id="promo_name" name="name" form="promotion-form" required maxLength={200} className="input mt-1.5" placeholder="£10 Off First Visit" />
        </div>
        <div>
          <label htmlFor="promo_referrer" className="label">Referrer reward</label>
          <input id="promo_referrer" name="referrer_reward" form="promotion-form" required maxLength={200} className="input mt-1.5" placeholder="100 Loyalty Points" />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" form="promotion-form" className="btn btn-secondary">Create promotion</button>
        </div>
        {state.error && <Notice variant="error" className="sm:col-span-2">{state.error}</Notice>}
      </div>

      {promotions.length > 0 && (
        <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
          {promotions.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{p.name}</p>
                <p className="text-[13px] text-ink-3">{p.referrer_reward}</p>
              </div>
              <ConfirmActionButton label="Delete Promotion" confirmLabel="Delete?" ariaLabel={`Delete promotion ${p.name}`} onConfirm={() => deleteReferralPromotion(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
