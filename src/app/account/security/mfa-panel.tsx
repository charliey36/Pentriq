'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { friendlyFactorName, MAX_FACTORS, normaliseTotpCode } from '@/lib/mfa';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { CopyButton } from '@/components/ui/copy-button';
import { syncMfaEnrollment } from './actions';

type Factor = { id: string; friendly_name?: string | null; created_at: string; status: string; factor_type: string };
type Enrolling = { factorId: string; qr: string; secret: string };

/**
 * Two-factor authentication with an authenticator app (TOTP): set up, confirm with a code, list and remove.
 * Whether two-factor is required (by the organisation's policy, or because the user is a platform admin) is
 * shown, and the last authenticator cannot be removed while it is required.
 */
const REQUIRED_BY: Record<'organisation' | 'admin', { subject: string; short: string }> = {
  organisation: { subject: 'Your organisation requires', short: 'Required by your organisation.' },
  admin: { subject: 'The Admin Portal requires', short: 'Required for the Admin Portal.' },
};

export function MfaPanel({ requiredBy, setupRequired, next }: { requiredBy: 'organisation' | 'admin' | null; setupRequired: boolean; next: string }) {
  const required = requiredBy !== null;
  const why = REQUIRED_BY[requiredBy ?? 'organisation'];
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError('Could not load your two-factor settings. Refresh the page to try again.');
      setFactors([]);
      return;
    }
    setFactors((data?.all ?? []).filter((f) => f.factor_type === 'totp') as Factor[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const verified = (factors ?? []).filter((f) => f.status === 'verified');

  async function startEnroll() {
    setError(null);
    setMessage(null);
    setBusy('enroll');
    const supabase = createClient();
    // Abandoned set-ups leave unverified factors behind; clear them so names and limits stay clean.
    for (const f of (factors ?? []).filter((x) => x.status !== 'verified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: friendlyFactorName('Authenticator app', verified.map((f) => f.friendly_name ?? '')),
    });
    setBusy(null);
    if (enrollError || !data) {
      setError(enrollError?.message ?? 'Could not start two-factor set-up. Please try again.');
      return;
    }
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode('');
  }

  async function confirmEnroll(event: React.FormEvent) {
    event.preventDefault();
    if (!enrolling) return;
    const clean = normaliseTotpCode(code);
    if (!clean) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError(null);
    setBusy('verify');
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.factorId, code: clean });
    if (verifyError) {
      setBusy(null);
      setError('That code did not match. Check the time on your phone is set automatically, then try the newest code.');
      return;
    }
    const sync = await syncMfaEnrollment();
    await supabase.auth.refreshSession();
    setBusy(null);
    setEnrolling(null);
    setCode('');
    if (!sync.ok) setError(sync.error ?? 'Two-factor is on, but we could not save it to your account. Refresh and try again.');
    else setMessage('Two-factor authentication is on. You will be asked for a code each time you sign in.');
    await load();
    if (setupRequired && sync.ok) {
      router.replace(next);
      return;
    }
    router.refresh();
  }

  async function remove(factor: Factor) {
    setError(null);
    setMessage(null);
    if (required && verified.length <= 1 && factor.status === 'verified') {
      setError(`${why.subject} two-factor authentication. Add another authenticator before removing this one.`);
      return;
    }
    setBusy(factor.id);
    const supabase = createClient();
    const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (removeError) {
      setBusy(null);
      setError(
        /aal2|assurance/i.test(removeError.message)
          ? 'For your security, sign out and back in with your code before removing an authenticator.'
          : 'Could not remove that authenticator. Please try again.'
      );
      return;
    }
    await syncMfaEnrollment();
    await supabase.auth.refreshSession();
    setBusy(null);
    setMessage('Authenticator removed.');
    await load();
    router.refresh();
  }

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="mfa-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="mfa-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Icon name="shield" className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            Two-factor authentication
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-3">
            Ask for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and similar) every time you sign in, so a stolen password is not enough.
          </p>
        </div>
        {factors !== null && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${verified.length > 0 ? 'bg-brand-500/10 text-brand-700 ring-brand-600/20 dark:text-brand-300' : 'bg-surface-muted text-ink-3 ring-line-strong/60'}`}>
            {verified.length > 0 ? 'On' : 'Off'}
          </span>
        )}
      </div>

      {setupRequired && verified.length === 0 && (
        <Notice variant="warning" className="mt-4">
          {why.subject} two-factor authentication. Set it up below to continue to Pentriq.
        </Notice>
      )}
      {required && !setupRequired && <p className="mt-3 text-xs text-ink-3">{why.short}</p>}
      {error && <Notice variant="error" className="mt-4">{error}</Notice>}
      {message && <Notice variant="success" className="mt-4">{message}</Notice>}

      {factors === null ? (
        <div className="mt-5 flex items-center gap-2 text-[13px] text-ink-3"><Spinner className="h-4 w-4" /> Loading…</div>
      ) : (
        <>
          {verified.length > 0 && (
            <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
              {verified.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon name="lock" className="h-4 w-4 text-ink-4" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{f.friendly_name || 'Authenticator app'}</span>
                    <span className="block text-xs text-ink-4">Added {new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </span>
                  <button type="button" onClick={() => remove(f)} disabled={busy !== null} className="btn btn-danger-ghost btn-sm">
                    {busy === f.id ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="x" className="h-3.5 w-3.5" />}
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {enrolling ? (
            <form onSubmit={confirmEnroll} className="mt-5 grid gap-5 rounded-xl border border-brand-500/25 bg-brand-500/[0.04] p-4 sm:grid-cols-[180px_1fr]">
              {/* The QR code is an SVG data URL generated by the auth server for this set-up only. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrolling.qr} alt="QR code to scan with your authenticator app" className="h-[180px] w-[180px] rounded-lg bg-white p-2 ring-1 ring-line" />
              <div className="min-w-0 space-y-3">
                <ol className="list-decimal space-y-1 pl-4 text-[13px] leading-5 text-ink-2">
                  <li>Open your authenticator app and scan the QR code.</li>
                  <li>Enter the 6-digit code it shows.</li>
                </ol>
                <div className="text-xs text-ink-3">
                  Can&apos;t scan? Enter this key instead:
                  <span className="mt-1 flex items-center gap-1">
                    <code className="break-all rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[12px] text-ink">{enrolling.secret}</code>
                    <CopyButton value={enrolling.secret} label="Copy key" />
                  </span>
                </div>
                <div>
                  <label htmlFor="enroll-code" className="label">Code from the app</label>
                  <input
                    id="enroll-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={9}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="input mt-1.5 max-w-[180px] font-mono tracking-[0.3em]"
                    placeholder="123456"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={busy !== null} className="btn btn-primary btn-sm">
                    {busy === 'verify' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" />}
                    Turn on two-factor
                  </button>
                  <button type="button" onClick={() => setEnrolling(null)} className="btn btn-ghost btn-sm">Cancel</button>
                </div>
              </div>
            </form>
          ) : (
            verified.length < MAX_FACTORS && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={startEnroll} disabled={busy !== null} className="btn btn-primary btn-sm">
                  {busy === 'enroll' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="plus" className="h-3.5 w-3.5" />}
                  {verified.length > 0 ? 'Add a backup authenticator' : 'Set up two-factor'}
                </button>
                {verified.length === 1 && (
                  <p className="text-xs text-ink-3">Tip: add a second device as a backup in case you lose your phone. An admin can also reset it for you.</p>
                )}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
