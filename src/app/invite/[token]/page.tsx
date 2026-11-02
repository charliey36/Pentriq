import type { Metadata } from 'next';
import Link from 'next/link';
import { getAuthUser } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupInvitation, normaliseEmail } from '@/lib/team';
import { ROLE_LABELS } from '@/lib/permissions';
import { AuthShell } from '@/components/auth-shell';
import { Notice } from '@/components/ui/notice';
import { AcceptButton } from './accept-button';

export const metadata: Metadata = { title: 'Team invitation', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const invite = await lookupInvitation(createAdminClient() as never, params.token);
  const user = await getAuthUser();
  const back = `/invite/${params.token}`;
  const next = encodeURIComponent(back);

  if (!invite || invite.state !== 'valid') {
    const reason =
      !invite ? 'This invitation link is not valid.'
      : invite.state === 'expired' ? 'This invitation has expired. Ask your team to send a new one.'
      : 'This invitation has already been used or withdrawn.';
    return (
      <AuthShell title="Invitation unavailable" subtitle="We couldn't use this link." footer={<Link href="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-400">Go to log in</Link>}>
        <Notice variant="error">{reason}</Notice>
      </AuthShell>
    );
  }

  const wrongAccount = user && (!user.email || normaliseEmail(user.email) !== normaliseEmail(invite.email));
  return (
    <AuthShell
      title={`Join ${invite.businessName}`}
      subtitle={`You've been invited as ${ROLE_LABELS[invite.role].label.toLowerCase()}. ${ROLE_LABELS[invite.role].summary}`}
      footer={<>Invitation for <strong>{invite.email}</strong></>}
    >
      {!user ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-3">Create an account or log in with <strong>{invite.email}</strong> to accept.</p>
          <Link href={`/signup?next=${next}`} className="btn btn-primary btn-lg w-full">Create an account</Link>
          <Link href={`/login?next=${next}`} className="btn btn-secondary btn-lg w-full">I already have an account</Link>
        </div>
      ) : wrongAccount ? (
        <Notice variant="warning">
          You&apos;re signed in as {user.email ?? 'another account'}, but this invitation is for {invite.email}. Sign out and sign in with the invited address to accept it.
        </Notice>
      ) : (
        <AcceptButton token={params.token} />
      )}
    </AuthShell>
  );
}
