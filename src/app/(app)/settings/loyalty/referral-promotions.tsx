'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { useActionToast } from '@/components/toast';
import type { ReferralPromotion } from '@/lib/database.types';
import type { RewardType } from '@/lib/referral-rewards';
import { Badge } from '@/components/ui/badge';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { Notice } from '@/components/ui/notice';
import { SectionCard } from '@/components/ui/section-card';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  createReferralPromotion,
  deleteReferralPromotion,
  updateReferralPromotion,
  type LoyaltyFormResult,
} from './actions';

const TABS: Array<{ type: RewardType; label: string }> = [
  { type: 'points', label: 'Loyalty Points' },
  { type: 'custom', label: 'Custom Reward' },
];

/** One reward (referrer or referred customer): a two-tab switch plus the matching input. */
function RewardField({
  prefix,
  title,
  initialType = 'points',
  initialPoints,
  initialText,
}: {
  prefix: 'referrer' | 'customer';
  title: string;
  initialType?: RewardType;
  initialPoints?: number | null;
  initialText?: string;
}) {
  const [type, setType] = useState<RewardType>(initialType);

  return (
    <fieldset className="rounded-xl border border-line p-4">
      <legend className="label px-1">{title}</legend>
      <input type="hidden" name={`${prefix}_type`} value={type} />
      <div role="tablist" aria-label={`${title} type`} className="inline-flex rounded-lg bg-surface-muted p-1 ring-1 ring-inset ring-line">
        {TABS.map((tab) => (
          <button
            key={tab.type}
            type="button"
            role="tab"
            aria-selected={type === tab.type}
            onClick={() => setType(tab.type)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              type === tab.type ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {type === 'points' ? (
          <>
            <label htmlFor={`${prefix}_points`} className="label">Points amount</label>
            <div className="relative mt-1.5 w-full sm:w-48">
              <input
                id={`${prefix}_points`}
                name={`${prefix}_points`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                defaultValue={initialPoints ?? 100}
                className="input pr-11 tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-4">pts</span>
            </div>
          </>
        ) : (
          <>
            <label htmlFor={`${prefix}_text`} className="label">Reward description</label>
            <input
              id={`${prefix}_text`}
              name={`${prefix}_text`}
              required
              maxLength={200}
              defaultValue={initialText ?? ''}
              className="input mt-1.5"
              placeholder="£10 Off First Visit"
            />
            <p className="mt-1 text-xs text-ink-4">e.g. Free Haircut, Free Consultation, 20% Discount</p>
          </>
        )}
      </div>
    </fieldset>
  );
}

function PromotionForm({ promotion, onDone }: { promotion?: ReferralPromotion; onDone?: () => void }) {
  const editing = Boolean(promotion);
  const action = promotion ? updateReferralPromotion.bind(null, promotion.id) : createReferralPromotion;
  const [state, formAction] = useFormState<LoyaltyFormResult, FormData>(action, {});
  // Remounting after a successful create clears every field, including the tab selection.
  const [formKey, setFormKey] = useState(0);
  useActionToast(state, { title: editing ? 'Promotion updated successfully' : 'Promotion created successfully' });

  useEffect(() => {
    if (!state.success) return;
    if (editing) onDone?.();
    else setFormKey((k) => k + 1);
  }, [state, editing, onDone]);

  return (
    <form key={formKey} action={formAction} className="max-w-4xl space-y-4">
      <div>
        <label htmlFor={`promo_name_${promotion?.id ?? 'new'}`} className="label">Promotion name</label>
        <input
          id={`promo_name_${promotion?.id ?? 'new'}`}
          name="name"
          required
          maxLength={200}
          defaultValue={promotion?.name ?? ''}
          className="input mt-1.5"
          placeholder="£10 Off First Visit"
        />
        <p className="mt-1 text-xs text-ink-4">The name you will pick from the Referrals dropdown.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <RewardField
        prefix="referrer"
        title="Referrer reward"
        initialType={promotion?.referrer_reward_type}
        initialPoints={promotion?.referrer_points}
        initialText={promotion?.referrer_reward_type === 'custom' ? promotion.referrer_reward : ''}
      />
      <RewardField
        prefix="customer"
        title="Referred customer reward"
        initialType={promotion?.customer_reward_type}
        initialPoints={promotion?.customer_points}
        initialText={promotion?.customer_reward_type === 'custom' ? promotion.customer_reward : ''}
      />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText={editing ? 'Saving…' : 'Creating…'}>{editing ? 'Save changes' : 'Create Promotion'}</SubmitButton>
        {editing && <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>}
      </div>
      {state.error && <Notice variant="error">{state.error}</Notice>}
    </form>
  );
}

function RewardLine({ label, type, value }: { label: string; type: RewardType; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-4">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
        {value}
        <Badge tone={type === 'points' ? 'success' : 'neutral'}>{type === 'points' ? 'Points' : 'Custom'}</Badge>
      </p>
    </div>
  );
}

export function ReferralPromotions({ promotions }: { promotions: ReferralPromotion[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <SectionCard
      className="mt-6"
      title="Referral Promotions"
      description="Create the offers you can attach to a referral code. Deleting a promotion does not change referrals that already used it."
    >
      <PromotionForm />

      {promotions.length > 0 && (
        <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {promotions.map((p) => (
            <li key={p.id} className="rounded-xl border border-line p-4">
              {editingId === p.id ? (
                <PromotionForm promotion={p} onDone={() => setEditingId(null)} />
              ) : (
                <>
                  <p className="text-base font-semibold text-ink">{p.name}</p>
                  <div className="mt-3 space-y-3">
                    <RewardLine label="Referrer" type={p.referrer_reward_type} value={p.referrer_reward} />
                    <RewardLine label="Referred Customer" type={p.customer_reward_type} value={p.customer_reward} />
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(p.id)} aria-label={`Edit promotion ${p.name}`}>
                      Edit
                    </button>
                    <ConfirmActionButton label="Delete" confirmLabel="Delete?" ariaLabel={`Delete promotion ${p.name}`} onConfirm={() => deleteReferralPromotion(p.id)} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
