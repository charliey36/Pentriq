import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ThemeToggleButton } from '@/components/theme-toggle-button';
import { HeaderAccount, MobileAccountLinks } from '@/components/marketing/header-account';

export const NAV_LINKS: [string, string][] = [
  ['Features', '/#features'],
  ['How it works', '/#how-it-works'],
  ['Pricing', '/pricing'],
  ['Blog', '/blog'],
];

const link = 'rounded-lg px-3 py-2 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-muted/70 hover:text-ink';

/** Public site header: desktop nav plus a no-JS mobile menu (<details>). */
export function SiteHeader() {
  return (
    <header className="glass sticky top-0 z-30 border-b border-line/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Pentriq home" className="rounded-md">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(([label, href]) => (
            <Link key={href} href={href} className={link}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggleButton />
          <HeaderAccount />
          <details className="group relative md:hidden">
            <summary
              aria-label="Open menu"
              className="btn btn-ghost btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden"
            >
              <span aria-hidden="true" className="text-lg leading-none group-open:hidden">☰</span>
              <span aria-hidden="true" className="hidden text-lg leading-none group-open:inline">✕</span>
              <span className="sr-only">Menu</span>
            </summary>
            <nav
              aria-label="Mobile"
              className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-pop"
            >
              {NAV_LINKS.map(([label, href]) => (
                <Link key={href} href={href} className={`block ${link}`}>
                  {label}
                </Link>
              ))}
              <MobileAccountLinks />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
