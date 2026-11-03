'use client';

import Link from 'next/link';
import { checkPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';

type Mode = 'login' | 'signup';

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  // Where to land after auth. Defaults keep the old behaviour (new accounts -> onboarding, returning users -> dashboard).
  const afterSignup = next ?? '/onboarding';
  const afterLogin = next ?? '/dashboard';
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Shown only when Google sign-in is switched on for the Supabase project (NEXT_PUBLIC_GOOGLE_SIGNIN=1).
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === '1';

  async function signInWithGoogle() {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(afterSignup)}` },
    });
    if (oauthError) setError(oauthError.message);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const check = checkPassword(password, { email });
        if (!check.ok) throw new Error(check.error);
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(afterSignup)}`,
          },
        });
        if (signUpError) throw signUpError;

        // If email confirmation is disabled in the Supabase project (typical
        // for a demo), the user is signed in immediately. Otherwise show a
        // message asking them to check their inbox.
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          // New accounts go straight to the guided first send (it also starts the free trial).
          router.push(afterSignup);
          router.refresh();
        } else {
          setMessage('Account created. Check your email for a confirmation link (look in spam if it does not arrive), then you can finish setup.');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.push(afterLogin);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input mt-1.5 py-2.5"
          placeholder="you@business.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <div className="relative mt-1.5">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={mode === 'signup' ? PASSWORD_MIN_LENGTH : undefined}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input py-2.5 pr-11"
            placeholder={mode === 'signup' ? `At least ${PASSWORD_MIN_LENGTH} characters` : 'Your password'}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-surface-muted hover:text-ink-2"
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mode === 'login' && (
        <p className="-mt-2 text-right text-sm">
          <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Forgot password?
          </Link>
        </p>
      )}

      {error && <Notice variant="error">{error}</Notice>}
      {message && <Notice variant="success">{message}</Notice>}

      {mode === 'signup' && (
        <p className="text-xs leading-5 text-ink-4">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink-2">Terms</Link> and{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink-2">Privacy Policy</Link>.
        </p>
      )}

      <button type="submit" disabled={loading} aria-busy={loading} className="btn btn-primary btn-lg w-full">
        {loading ? (
          <>
            <Spinner />
            Please wait…
          </>
        ) : mode === 'signup' ? (
          'Create account'
        ) : (
          'Log in'
        )}
      </button>
      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-ink-4" aria-hidden="true">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <button type="button" onClick={signInWithGoogle} disabled={loading} className="btn btn-secondary btn-lg w-full">
            Continue with Google
          </button>
        </>
      )}
    </form>
  );
}
