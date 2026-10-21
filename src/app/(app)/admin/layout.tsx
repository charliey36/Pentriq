import type { ReactNode } from 'react';
import { getAuthUser } from '@/lib/business';
import { isAdminEmail } from '@/lib/admin-access';

/**
 * Defence in depth: middleware already answers 403 for non-admins on /admin/*, and every admin
 * server action re-checks admin status. This layout stops any admin page rendering for a
 * non-admin even if the middleware were bypassed.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  if (!isAdminEmail(user?.email)) {
    return (
      <div role="alert" className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold text-ink">403 — Not authorised</h1>
        <p className="mt-2 text-sm text-ink-3">You do not have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
