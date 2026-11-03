'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { checkPassword, passwordStrength, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { recordPasswordChanged } from './actions';

const STRENGTH = ['', 'Too weak', 'Fair', 'Good', 'Strong'] as const;
const STRENGTH_BAR = ['bg-line-strong', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-brand-500'] as const;

export function PasswordPanel({ email }: { email: string | null }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const strength = passwordStrength(password);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    const check = checkPassword(password, { email });
    if (!check.ok) return setError(check.error);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(
        /reauthenticat|recent/i.test(updateError.message)
          ? 'For your security, sign out and back in, then change your password straight away.'
          : updateError.message
      );
      return;
    }
    await recordPasswordChanged().catch(() => undefined);
    setPassword('');
    setConfirm('');
    setDone(true);
  }

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="password-title">
      <h2 id="password-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Icon name="lock" className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        Password
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">
        At least {PASSWORD_MIN_LENGTH} characters. A short phrase is easier to remember and harder to guess than a complex word.
      </p>
      <form onSubmit={submit} className="mt-4 grid max-w-md gap-3">
        <div>
          <label htmlFor="new-password" className="label">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1.5" />
          {password && (
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex h-1.5 flex-1 gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-full flex-1 rounded-full ${i <= strength ? STRENGTH_BAR[strength] : 'bg-surface-muted'}`} />
                ))}
              </div>
              <span className="w-16 text-right text-xs text-ink-3">{STRENGTH[strength]}</span>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="confirm-password" className="label">Confirm new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input mt-1.5" />
        </div>
        {error && <Notice variant="error">{error}</Notice>}
        {done && <Notice variant="success">Password changed.</Notice>}
        <div>
          <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
            {busy && <Spinner className="h-3.5 w-3.5" />}
            Change password
          </button>
        </div>
      </form>
    </section>
  );
}
