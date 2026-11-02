'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCan } from '@/components/role-context';
import type { Capability } from '@/lib/permissions';

const tabs: { href: string; label: string; capability: Capability }[] = [
  { capability: 'settings.write', href: '/settings', label: 'General' },
  { capability: 'settings.write', href: '/settings/services', label: 'Services' },
  { capability: 'settings.write', href: '/settings/loyalty', label: 'Loyalty program' },
  { capability: 'settings.write', href: '/settings/reputation', label: 'Reputation' },
  { capability: 'integrations.manage', href: '/settings/integrations', label: 'Integrations' },
  { capability: 'team.manage', href: '/settings/team', label: 'Team' },
  { capability: 'team.manage', href: '/settings/security', label: 'Security & audit' },
  { capability: 'billing.manage', href: '/settings/billing', label: 'Billing' },
  { capability: 'data.export', href: '/settings/privacy', label: 'Data & privacy' },
];

/** Section navigation shared by every Settings page. */
export function SettingsTabs() {
  const pathname = usePathname();
  const allowed: Record<Capability, boolean> = {
    'settings.write': useCan('settings.write'),
    'integrations.manage': useCan('integrations.manage'),
    'team.manage': useCan('team.manage'),
    'billing.manage': useCan('billing.manage'),
    'data.export': useCan('data.export'),
    'customers.read': true,
    'customers.write': true,
    'account.delete': useCan('account.delete'),
  };
  const visibleTabs = tabs.filter((t) => allowed[t.capability]);

  return (
    <nav aria-label="Settings sections" className="scroll-thin -mb-px flex gap-1 overflow-x-auto">
      {visibleTabs.map((tab) => {
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
