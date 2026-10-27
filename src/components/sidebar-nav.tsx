'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icons';

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Shows an unread count next to the label. */
  badge?: 'feedback' | 'reviews';
};

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { href: '/analytics', label: 'Analytics', icon: 'chart' },
      { href: '/reviews', label: 'Reviews Analytics', icon: 'star', badge: 'reviews' },
    ],
  },
  {
    label: 'Audience',
    items: [
      { href: '/customers', label: 'Customers', icon: 'users' },
      { href: '/customers/import', label: 'Import', icon: 'upload' },
      { href: '/segments', label: 'Segments', icon: 'funnel' },
      { href: '/referrals', label: 'Referrals', icon: 'userPlus' },
      { href: '/feedback-inbox', label: 'Feedback', icon: 'chat', badge: 'feedback' },
      { href: '/review-link', label: 'QR & review link', icon: 'star' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/settings', label: 'Settings', icon: 'cog' },
      { href: '/how-it-works', label: 'How it works', icon: 'lightbulb' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { href: '/blog', label: 'Blog', icon: 'mail' },
      { href: '/roadmap', label: 'Roadmap', icon: 'calendar' },
      { href: '/changelog', label: 'Changelog', icon: 'sparkles' },
    ],
  },
];

/** A section is active for its own path and anything nested beneath it. */
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Grouped sidebar navigation. The active item gets a brand-tinted gradient
 * pill, a glowing edge marker and a colored icon; everything else stays
 * quiet until hovered.
 */
export function SidebarNav({ feedbackCount = 0, reviewAlertCount = 0 }: { feedbackCount?: number; reviewAlertCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();

  // The most specific matching item wins, so /customers/import doesn't also light up Customers.
  const allHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((h) => isActivePath(pathname, h))
    .sort((a, b) => b.length - a.length)[0];

  // Clicking a section always loads fresh data: on the same page it refreshes in place,
  // from inside it (e.g. a customer) it goes back to the list.
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (href === pathname) router.refresh();
    else router.push(href);
  }

  return (
    <nav aria-label="Main" className="scroll-thin flex-1 overflow-y-auto px-3 pb-4 pt-2">
      {navGroups.map((group) => (
        <div key={group.label} className="mt-5 first:mt-2">
          <p className="eyebrow px-3 pb-2 text-ink-4">{group.label}</p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = item.href === activeHref;
              const badgeCount = item.badge === 'feedback' ? feedbackCount : item.badge === 'reviews' ? reviewAlertCount : 0;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={(e) => handleClick(e, item.href)}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-brand-500/[0.16] via-brand-500/[0.07] to-transparent text-brand-800 ring-1 ring-inset ring-brand-500/20 dark:text-brand-200'
                        : 'text-ink-3 hover:translate-x-0.5 hover:bg-surface-muted/80 hover:text-ink'
                    }`}
                  >
                    {/* Edge marker so the current page isn't signalled by color alone. */}
                    <span
                      aria-hidden="true"
                      className={`absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500 shadow-[0_0_14px_2px_rgb(16_185_129/0.55)] transition-opacity duration-200 ${
                        active ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                        active
                          ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_6px_12px_-4px_rgb(16_185_129/0.65)]'
                          : 'text-ink-4 group-hover:bg-surface group-hover:text-ink-2 group-hover:shadow-xs'
                      }`}
                    >
                      <Icon name={item.icon} className="h-[17px] w-[17px]" strokeWidth={active ? 1.8 : 1.6} />
                    </span>
                    <span className="truncate">{item.label}</span>
                    {badgeCount > 0 && (
                      <span
                        className="ml-auto inline-flex min-w-[22px] items-center justify-center rounded-full bg-gradient-to-b from-rose-400 to-rose-600 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-white shadow-[0_4px_10px_-3px_rgb(244_63_94/0.65)]"
                        aria-label={`${badgeCount} new`}
                      >
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
