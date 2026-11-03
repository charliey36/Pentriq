import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/business';
import { safeNextPath } from '@/lib/safe-redirect';
import { AccountShell } from '@/components/account-shell';
import { Icon } from '@/components/ui/icons';
import { MfaChallenge } from './mfa-challenge';

export const metadata: Metadata = { title: 'Enter your code', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const user = await getAuthUser();
  if (!user) redirect('/login');
  if (user.aal === 'aal2') redirect(next);

  return (
    <AccountShell back={false}>
      <div className="mx-auto max-w-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
          <Icon name="shield" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-center text-2xl font-semibold tracking-[-0.02em] text-ink">Two-factor authentication</h1>
        <p className="mb-6 mt-2 text-center text-[14px] text-ink-3">
          {user.email ? <>Signed in as <span className="font-medium text-ink-2">{user.email}</span>. </> : null}
          Enter the code from your authenticator app to continue.
        </p>
        <div className="card p-5 sm:p-6">
          <MfaChallenge next={next} />
        </div>
      </div>
    </AccountShell>
  );
}
