import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { Icon } from '@/components/ui/icons';
import { LegalLinks } from '@/components/legal-links';
import { logout } from '@/app/(app)/actions';

/**
 * Minimal frame for account-level pages that must work before the full app shell is allowed (two-factor setup
 * required by the organisation, or the two-factor code step). No business data is loaded here.
 */
export function AccountShell({ children, back = true }: { children: ReactNode; back?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass sticky top-0 z-20 border-b border-line/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/dashboard" aria-label="Pentriq dashboard" className="rounded-md">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {back && (
              <Link href="/dashboard" className="btn btn-ghost btn-sm">
                <Icon name="arrowLeft" className="h-4 w-4" />
                Dashboard
              </Link>
            )}
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm">
                <Icon name="logout" className="h-4 w-4" />
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-3xl justify-end px-4 pb-6 sm:px-6">
        <LegalLinks />
      </footer>
    </div>
  );
}
