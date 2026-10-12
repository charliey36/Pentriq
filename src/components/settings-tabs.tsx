'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/settings', label: 'General' },
  { href: '/settings/services', label: 'Services' },
  { href: '/settings/loyalty', label: 'Loyalty program' },
  { href: '/settings/email', label: 'Email' },
  { href: '/settings/reputation', label: 'Reputation' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/privacy', label: 'Data & privacy' },
];

/** Section navigation shared by the three Settings pages. */
export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="scroll-thin -mb-px flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors duration-150 ${
              active
                ? 'border-brand-600 text-ink dark:border-brand-400'
                : 'border-transparent text-ink-3 hover:border-line-strong hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
