import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/business';
import { adminAccess } from '@/lib/admin-access';
import { gateRedirect } from '@/lib/mfa';
import { safeNextPath } from '@/lib/safe-redirect';

/**
 * Defence in depth: middleware already answers 403 for non-admins on /admin/* and sends admins without a
 * two-factor session to the code step, and every admin server action re-checks both. This layout stops any
 * admin page rendering for either even if the middleware were bypassed.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = adminAccess(await getAuthUser());
  if (access === 'verify' || access === 'enroll') {
    const requested = (await headers()).get('x-pathname');
    redirect(gateRedirect(access, requested?.startsWith('/admin') ? safeNextPath(requested) : '/admin'));
  }
  if (access !== 'ok') {
    return (
      <div role="alert" className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold text-ink">403 — Not authorised</h1>
        <p className="mt-2 text-sm text-ink-3">You do not have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
