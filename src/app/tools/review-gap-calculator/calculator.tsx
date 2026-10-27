'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ASSUMED_CURRENT_CAPTURE, ASSUMED_PENTRIQ_CAPTURE, calculateReviewGap, validateGapInput } from '@/lib/review-gap';

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
const fmt = (n: number) => n.toLocaleString('en-GB');

export function ReviewGapCalculator() {
  const [customers, setCustomers] = useState('80');
  const [reviews, setReviews] = useState('25');
  const [rating, setRating] = useState('4.6');

  const input = { monthlyCustomers: num(customers), currentReviews: num(reviews), averageRating: num(rating) };
  const error = validateGapInput(input);
  const result = error ? null : calculateReviewGap(input);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form className="card space-y-5 p-6 sm:p-8" onSubmit={(e) => e.preventDefault()} aria-label="Review gap calculator">
        {([
          ['customers', 'How many customers do you serve each month?', customers, setCustomers, '1', '1'],
          ['reviews', 'How many reviews do you have now?', reviews, setReviews, '0', '1'],
          ['rating', 'What is your average star rating?', rating, setRating, '1', '0.1'],
        ] as const).map(([id, label, value, set, min, step]) => (
          <div key={id}>
            <label htmlFor={id} className="label">{label}</label>
            <input id={id} type="number" inputMode="decimal" min={min} step={step} value={value} onChange={(e) => set(e.target.value)} className="input mt-1.5 text-lg tabular-nums" />
          </div>
        ))}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p className="text-xs leading-5 text-ink-3">
          Estimates assume about {Math.round(ASSUMED_CURRENT_CAPTURE * 100)}% of customers leave a review when you ask ad hoc, and about {Math.round(ASSUMED_PENTRIQ_CAPTURE * 100)}% with an automatic request plus two reminders. Real results vary by business.
        </p>
      </form>

      <div className="relative isolate overflow-hidden rounded-3xl p-6 text-white shadow-hero sm:p-8" style={{ backgroundImage: 'linear-gradient(135deg, #064e3b 0%, #065f46 30%, #0f766e 70%, #0e7490 100%)' }} aria-live="polite">
        <div aria-hidden="true" className="absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-emerald-300/30 blur-3xl" />
        {result ? (
          <>
            <p className="eyebrow text-emerald-100/80">You may be missing</p>
            <p className="mt-2 text-6xl font-semibold tracking-[-0.04em] tabular-nums">{fmt(result.missedPerMonth)}<span className="ml-2 text-xl font-normal text-emerald-100/80">reviews a month</span></p>
            <p className="mt-2 text-emerald-50/85">That is about <b>{fmt(result.missedPerYear)}</b> reviews a year that happy customers would have left if asked at the right time.</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15">
                <p className="text-xs text-emerald-100/75">Reviews in 12 months, as you are</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(result.reviewsInYearNow)}</p>
              </div>
              <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-inset ring-white/25">
                <p className="text-xs text-emerald-100/75">With Pentriq</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(result.reviewsInYearWithPentriq)}{result.growthPercent !== null && <span className="ml-1.5 text-sm font-medium text-emerald-200">+{fmt(result.growthPercent)}%</span>}</p>
              </div>
            </div>

            <p className="mt-5 text-sm leading-6 text-emerald-50/85">{result.message}</p>

            <div className="mt-6 rounded-2xl bg-white p-5 text-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Suggested plan</p>
              <p className="mt-1 text-xl font-semibold">{result.plan.name} <span className="text-slate-500">· {result.plan.currency}{result.plan.price}/month</span></p>
              <p className="mt-1 text-sm text-slate-600">{result.plan.reason}{result.costPerExtraReview !== null && <> That works out at roughly <b>{result.plan.currency}{result.costPerExtraReview.toFixed(2)}</b> per extra review.</>}</p>
              <Link href="/signup" className="btn btn-primary btn-lg mt-4 w-full">Start your 30-day free trial</Link>
              <p className="mt-2 text-center text-xs text-slate-500">No card needed to start. Cancel any time.</p>
            </div>
          </>
        ) : (
          <p className="text-emerald-50/85">Fill in the three numbers to see how many reviews you could be missing.</p>
        )}
      </div>
    </div>
  );
}
