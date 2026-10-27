'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { STORAGE_KEYS, SETUP_COLLAPSED_COOKIE } from '@/lib/brand';
import { ProgressRing } from '@/components/ui/progress-ring';

export type SetupStep = {
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

const STORAGE_KEY = STORAGE_KEYS.setupDismissed;

function rememberCollapsed(collapsed: boolean) {
  try {
    document.cookie = collapsed
      ? `${SETUP_COLLAPSED_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
      : `${SETUP_COLLAPSED_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // Cookies unavailable: the guide just won't remember its state.
  }
}

/**
 * First-run guide. Setup is recommended, never required: while steps remain it
 * shows a progress ring and spotlights the next action, and it can be tucked
 * away into a one-line bar (the choice is remembered) and reopened any time.
 * When everything is done it swaps to a short celebration (a check that draws
 * itself) that can be dismissed for good.
 */
export function SetupChecklist({ steps, initiallyCollapsed = false }: { steps: SetupStep[]; initiallyCollapsed?: boolean }) {
  const completed = steps.filter((step) => step.done).length;
  const percent = steps.length === 0 ? 100 : Math.round((completed / steps.length) * 100);
  const allDone = completed === steps.length;
  const nextIndex = steps.findIndex((step) => !step.done);
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const setCollapsedAndRemember = (value: boolean) => {
    setCollapsed(value);
    rememberCollapsed(value);
  };

  // Dismissal is only relevant once complete. Wait for mount so a dismissed
  // card never flashes in from the server render.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (allDone) {
    if (dismissed !== false) return null;
    return (
      <section className="card relative isolate animate-fade-in-up overflow-hidden p-6 sm:p-7">
        <div
          aria-hidden="true"
          className="absolute -right-10 -top-16 -z-10 h-56 w-56 rounded-full bg-brand-400/25 blur-3xl"
        />
        <div className="flex flex-wrap items-center gap-5">
          <span className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_14px_28px_-10px_rgb(16_185_129/0.8)]">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7.5" pathLength={1} strokeDasharray={1} strokeDashoffset={0} className="draw-line [animation-delay:200ms]" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">You&apos;re all set &mdash; 100% complete 🎉</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-ink-3">
              Your first review is in. Pentriq will keep sending requests, follow up with reminders and
              track results automatically from here.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setDismissed(true);
              try {
                window.localStorage.setItem(STORAGE_KEY, 'true');
              } catch {
                // Storage unavailable: dismissal just won't persist.
              }
            }}
          >
            Dismiss
          </button>
        </div>
      </section>
    );
  }

  if (collapsed) {
    const next = steps[nextIndex];
    return (
      <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5" aria-label="Setup progress">
        <ProgressRing percent={(completed / steps.length) * 100} id="setup-mini" size={36} stroke={5}>
          <span className="text-[11px] font-semibold leading-none text-ink tabular-nums">{completed}/{steps.length}</span>
        </ProgressRing>
        <p className="min-w-0 flex-1 text-sm text-ink-2">
          <span className="font-medium text-ink">Setup {percent}% complete</span>
          {next && <span className="text-ink-3"> &middot; Next: {next.title}</span>}
        </p>
        {next && (
          <Link href={next.href} className="btn btn-primary btn-sm">
            {next.cta}
            <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCollapsedAndRemember(false)}>
          Show steps
        </button>
      </section>
    );
  }

  return (
    <section className="card relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute -left-16 -top-20 -z-10 h-64 w-64 rounded-full bg-brand-400/15 blur-3xl"
      />
      <div className="grid lg:grid-cols-[280px_1fr]">
        <div className="flex items-center gap-5 border-b border-line p-6 lg:flex-col lg:items-start lg:justify-between lg:border-b-0 lg:border-r lg:p-7">
          <ProgressRing percent={(completed / steps.length) * 100} id="setup" size={104} stroke={10}>
            <span className="text-2xl font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
              {completed}
              <span className="text-ink-4">/{steps.length}</span>
            </span>
          </ProgressRing>
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Get your first review</h2>
            <p className="mt-1 text-[13px] leading-5 text-ink-3">
              {percent}% complete ({completed} of {steps.length}). Most businesses reach their first request in one sitting; you can use everything
              else in Pentriq in the meantime.
            </p>
            <button type="button" className="btn btn-ghost btn-sm mt-3 -ml-2.5" onClick={() => setCollapsedAndRemember(true)}>
              Hide for now
            </button>
          </div>
        </div>

        <ol className="divide-y divide-line">
          {steps.map((step, index) => {
            const isNext = index === nextIndex;
            return (
              <li
                key={step.title}
                className={`flex items-center gap-4 px-5 py-5 transition-colors sm:px-7 ${
                  isNext ? 'bg-gradient-to-r from-brand-500/[0.09] to-transparent' : ''
                }`}
              >
                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition-all ${
                    step.done
                      ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_8px_16px_-6px_rgb(16_185_129/0.7)]'
                      : isNext
                        ? 'bg-surface text-brand-700 shadow-sm ring-2 ring-brand-500 dark:text-brand-300'
                        : 'bg-surface-muted text-ink-3 ring-1 ring-inset ring-line-strong'
                  }`}
                >
                  {step.done ? <Icon name="check" className="h-[18px] w-[18px]" strokeWidth={3} /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${step.done ? 'text-ink-4 line-through decoration-ink-4/50' : 'text-ink'}`}>
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-5 text-ink-3">{step.description}</p>
                </div>
                {!step.done && (
                  <Link href={step.href} className={`btn btn-sm ${isNext ? 'btn-primary' : 'btn-secondary'}`}>
                    {step.cta}
                    <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth={2} />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
