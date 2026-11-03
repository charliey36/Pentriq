'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { setRequireMfa } from './actions';

/** Owner switch for "everyone must use two-factor", with the team's current coverage. */
export function MfaPolicy({ enabled, canEdit, enrolled, members, selfEnrolled }: { enabled: boolean; canEdit: boolean; enrolled: number; members: number; selfEnrolled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const missing = members - enrolled;

  function toggle(next: boolean) {
    setError(null);
    start(async () => {
      const res = await setRequireMfa(next);
      if (res.error) setError(res.error);
      else setOn(Boolean(res.enabled));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface-subtle/60 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink">Require two-factor authentication for everyone</p>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {enrolled} of {members} member{members === 1 ? '' : 's'} {enrolled === 1 ? 'has' : 'have'} two-factor on.
            {on && missing > 0 && ` ${missing} will be asked to set it up when they next open Pentriq.`}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Require two-factor authentication for everyone"
            disabled={pending}
            onClick={() => toggle(!on)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 ${on ? 'bg-brand-600' : 'bg-line-strong'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
            {pending && <Spinner className="absolute -right-6 h-4 w-4" />}
          </button>
        ) : (
          <span className="text-xs text-ink-3">{on ? 'On' : 'Off'} · only the owner can change this</span>
        )}
      </div>
      {!selfEnrolled && (
        <p className="text-[13px] text-ink-3">
          You don&apos;t have two-factor on yet.{' '}
          <Link href="/account/security" className="font-medium text-brand-700 underline dark:text-brand-400">Set it up on your account</Link>.
        </p>
      )}
      {error && <Notice variant="error">{error}</Notice>}
    </div>
  );
}
