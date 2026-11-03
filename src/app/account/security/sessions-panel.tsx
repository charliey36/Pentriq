'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { revokeSessions } from './actions';

/** Sign out of every other device (lost laptop, shared computer), or of every device including this one. */
export function SessionsPanel() {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<'others' | 'global' | null>(null);
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function run(scope: 'others' | 'global') {
    setWhich(scope);
    setResult(null);
    start(async () => {
      const res = await revokeSessions(scope);
      setResult(res);
      setWhich(null);
    });
  }

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="sessions-title">
      <h2 id="sessions-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Icon name="logout" className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        Signed-in devices
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">Lost a phone or used a shared computer? Sign out everywhere else in one click.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run('others')} className="btn btn-secondary btn-sm">
          {which === 'others' && <Spinner className="h-3.5 w-3.5" />}
          Sign out of other devices
        </button>
        {confirmGlobal ? (
          <>
            <button type="button" disabled={pending} onClick={() => run('global')} className="btn btn-primary btn-sm">
              {which === 'global' && <Spinner className="h-3.5 w-3.5" />}
              Confirm: sign out everywhere
            </button>
            <button type="button" onClick={() => setConfirmGlobal(false)} className="btn btn-ghost btn-sm">Cancel</button>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirmGlobal(true)} className="btn btn-ghost btn-sm">
            Sign out everywhere, including here
          </button>
        )}
      </div>
      {result && <Notice variant={result.ok ? 'success' : 'error'} className="mt-4">{result.message}</Notice>}
    </section>
  );
}
