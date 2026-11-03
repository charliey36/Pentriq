import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/business';
import { isAdminEmail } from '@/lib/admin-access';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safe-redirect';
import { AccountShell } from '@/components/account-shell';
import { MfaPanel } from './mfa-panel';
import { PasswordPanel } from './password-panel';
import { SessionsPanel } from './sessions-panel';

export const metadata: Metadata = { title: 'Account security', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * The signed-in person's own security settings (not the organisation's). Reachable before the app shell when the
 * organisation requires two-factor and it is not set up yet, so it loads only the user and their membership.
 */
export default async function AccountSecurityPage({ searchParams }: { searchParams: Promise<{ setup?: string; next?: string }> }) {
  const params = await searchParams;
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: membership } = await createClient()
    .from('business_members')
    // businesses(*) rather than naming require_mfa: before migration 0045 the column is absent and the page still works.
    .select('role, businesses(*)')
    .eq('user_id', user.id)
    .maybeSingle()
    .returns<{ role: string; businesses: { name: string | null; require_mfa: boolean | null } | null } | null>();

  // Required by the organisation's policy, or because this is a platform admin (the Admin Portal needs two-factor).
  const requiredBy = membership?.businesses?.require_mfa === true ? 'organisation' : isAdminEmail(user.email) ? 'admin' : null;
  const setupRequired = params.setup === 'required';
  const next = safeNextPath(params.next);

  return (
    <AccountShell back={!setupRequired}>
      <div className="mb-8">
        <p className="eyebrow text-ink-4">Your account</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-ink">Account security</h1>
        <p className="mt-2 text-[15px] text-ink-3">
          Signed in as <span className="font-medium text-ink-2">{user.email ?? 'your account'}</span>
          {membership?.businesses?.name ? ` · ${membership.businesses.name}` : ''}.
        </p>
      </div>
      <div className="space-y-6">
        <MfaPanel requiredBy={requiredBy} setupRequired={setupRequired} next={next} />
        {!setupRequired && (
          <>
            <PasswordPanel email={user.email} />
            <SessionsPanel />
          </>
        )}
      </div>
    </AccountShell>
  );
}
