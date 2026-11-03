'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { normaliseTotpCode } from '@/lib/mfa';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { syncMfaEnrollment } from '@/app/account/security/actions';

type Factor = { id: string; friendly_name?: string | null };

/** The second sign-in step: a 6-digit code from the user's authenticator app upgrades the session to aal2. */
export function MfaChallenge({ next }: { next: string }) {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factorId, setFactorId] = useState<string>('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data, error: listError } = await createClient().auth.mfa.listFactors();
      if (listError) {
        setError('Could not load your authenticators. Refresh the page to try again.');
        setFactors([]);
        return;
      }
      const totp = (data?.totp ?? []) as Factor[];
      if (totp.length === 0) {
        // The account no longer has an authenticator (removed elsewhere): correct the flag and carry on.
        await syncMfaEnrollment();
        await createClient().auth.refreshSession();
        router.replace(next);
        router.refresh();
        return;
      }
      setFactors(totp);
      setFactorId(totp[0].id);
      input.current?.focus();
    })();
  }, [next, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const clean = normaliseTotpCode(code);
    if (!clean) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: clean });
    if (verifyError) {
      setBusy(false);
      setCode('');
      setError(/rate|too many/i.test(verifyError.message) ? 'Too many attempts. Wait a minute and try again.' : 'That code did not match. Try the newest code in your app.');
      input.current?.focus();
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (factors === null) {
    return <div className="flex items-center gap-2 text-[13px] text-ink-3"><Spinner className="h-4 w-4" /> Checking your account…</div>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {factors.length > 1 && (
        <div>
          <label htmlFor="factor" className="label">Authenticator</label>
          <select id="factor" value={factorId} onChange={(e) => setFactorId(e.target.value)} className="input mt-1.5">
            {factors.map((f) => (
              <option key={f.id} value={f.id}>{f.friendly_name || 'Authenticator app'}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="code" className="label">6-digit code</label>
        <input
          ref={input}
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={9}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="input mt-1.5 text-center font-mono text-lg tracking-[0.4em]"
          placeholder="••••••"
          aria-describedby="code-help"
        />
        <p id="code-help" className="field-hint">Open your authenticator app and enter the current code for Pentriq.</p>
      </div>
      {error && <Notice variant="error">{error}</Notice>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy && <Spinner className="h-4 w-4" />}
        Verify and continue
      </button>
      <p className="text-center text-xs text-ink-3">Lost your device? Ask your account owner or an admin to reset your two-factor from Settings → Team.</p>
    </form>
  );
}
