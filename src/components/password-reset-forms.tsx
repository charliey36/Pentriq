'use client';

import { useState } from 'react';
import { checkPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';

function Submit({ loading, children }: { loading: boolean; children: string }) {
  return (
    <button type="submit" disabled={loading} aria-busy={loading} className="btn btn-primary btn-lg w-full">
      {loading ? <Spinner /> : children}
    </button>
  );
}

/**
 * Supabase Auth generates the secure, single-use, expiring reset link (1 hour
 * by default) and emails it. We always show the same message so the form
 * never reveals whether an email has an account.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setSent(true);
    setLoading(false);
  }

  if (sent) return <Notice variant="success">If an account exists for this email, a reset link has been sent.</Notice>;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" type="email" required autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} className="input mt-1.5 py-2.5" placeholder="you@business.com" />
      </div>
      <Submit loading={loading}>Send reset link</Submit>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = checkPassword(password);
    if (!check.ok) return setError(check.error);
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    const supabase = createClient();
    // updateUser requires the recovery session created by the (valid, unexpired) link.
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    await supabase.auth.signOut();
    router.push('/login?reset=1');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="password" className="label">New password</label>
        <input id="password" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} className="input mt-1.5 py-2.5" />
      </div>
      <div>
        <label htmlFor="confirm" className="label">Confirm password</label>
        <input id="confirm" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} className="input mt-1.5 py-2.5" />
      </div>
      {error && <Notice variant="error">{error}</Notice>}
      <Submit loading={loading}>Save password</Submit>
    </form>
  );
}
