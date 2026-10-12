import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { LegalLinks } from '@/components/legal-links';
import { ThemeToggleButton } from '@/components/theme-toggle-button';

/** Header + footer frame shared by the blog index and article pages. */
export function BlogShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="glass sticky top-0 z-30 border-b border-line/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Pentriq home" className="rounded-md">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            <Link href="/#features" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-3 hover:bg-surface-muted/70 hover:text-ink">
              Features
            </Link>
            <Link href="/#how-it-works" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-3 hover:bg-surface-muted/70 hover:text-ink">
              How it works
            </Link>
            <Link href="/blog" className="rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted/70">
              Blog
            </Link>
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggleButton />
            <Link href="/login" className="btn btn-ghost btn-sm">
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 text-[13px] text-ink-3">
            <span>&copy; {new Date().getFullYear()} Pentriq</span>
            <Link href="/blog" className="hover:text-ink">
              Blog
            </Link>
            <Link href="/signup" className="hover:text-ink">
              Free trial
            </Link>
          </div>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
