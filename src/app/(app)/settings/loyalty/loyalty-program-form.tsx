'use client';

import { useFormState } from 'react-dom';
import { useActionToast } from '@/components/toast';
import type { LoyaltyProgram } from '@/lib/database.types';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { SectionCard } from '@/components/ui/section-card';
import { saveLoyaltyProgram, type LoyaltyFormResult } from './actions';

function PointsField({
  id,
  label,
  defaultValue,
  min = 0,
}: {
  id: string;
  label: string;
  defaultValue: number;
  min?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          name={id}
          type="number"
          min={min}
          defaultValue={defaultValue}
          className="input pr-11 tabular-nums"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-4">pts</span>
      </div>
    </div>
  );
}

export function LoyaltyProgramForm({ program }: { program: LoyaltyProgram | null }) {
  const [state, formAction] = useFormState<LoyaltyFormResult, FormData>(saveLoyaltyProgram, {});
  useActionToast(state, { title: 'Loyalty program saved' });

  return (
    <form id="loyalty-form" action={formAction} className="space-y-6">

      <SectionCard title="Earning rules and reward" description="How many points customers earn for each action, and what they get when they reach the redemption threshold.">
        <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          <PointsField id="points_per_visit" label="Per visit" defaultValue={program?.points_per_visit ?? 10} />
          <PointsField id="points_per_review" label="Per review" defaultValue={program?.points_per_review ?? 20} />
          <PointsField id="points_per_referral" label="Per referral" defaultValue={program?.points_per_referral ?? 50} />
        </div>

        <div className="mt-6 max-w-lg space-y-5">
          <div className="w-full sm:w-52">
            <PointsField
              id="redemption_points"
              label="Points needed to redeem"
              defaultValue={program?.redemption_points ?? 100}
              min={1}
            />
          </div>

          <div>
            <label htmlFor="redemption_reward_description" className="label">
              Reward description
            </label>
            <input
              id="redemption_reward_description"
              name="redemption_reward_description"
              type="text"
              required
              defaultValue={program?.redemption_reward_description ?? '£10 off your next visit'}
              className="input mt-1.5"
            />
          </div>
        </div>
      </SectionCard>

      {state.error && <Notice variant="error">{state.error}</Notice>}
    </form>
  );
}

/** Save button, rendered at the bottom of the page (below Referral Promotions) but submitting the main form. */
export function LoyaltySaveButton() {
  return (
    <div className="mt-6">
      <button type="submit" form="loyalty-form" className="btn btn-primary">
        <Icon name="check" className="h-4 w-4" strokeWidth={2.2} />
        Save loyalty program
      </button>
    </div>
  );
}

/** Header toggle; submitted with the main form via the `form` attribute. */
export function LoyaltyActiveToggle({ program }: { program: LoyaltyProgram | null }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
          <span className="text-sm font-semibold text-ink">Loyalty program active</span>

          <span className="relative inline-flex flex-shrink-0 items-center">
            <input
              type="checkbox"
              form="loyalty-form"
              role="switch"
              name="is_active"
              defaultChecked={program?.is_active ?? false}
              className="peer sr-only"
            />
            <span className="h-6 w-11 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-brand-600 peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand-500/30" />
            <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out-expo peer-checked:translate-x-5" />
          </span>
        </label>
  );
}
