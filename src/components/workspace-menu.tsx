'use client';

import Link from 'next/link';
import { useCan } from '@/components/role-context';
import { useEffect, useRef, useState } from 'react';
import { logout } from '@/app/(app)/actions';
import { useTheme } from '@/components/theme-context';
import { Avatar } from '@/components/ui/avatar';
import { Icon, type IconName } from '@/components/ui/icons';

/**
 * Workspace switcher at the top of the sidebar: who you are working as, plus
 * the account-level shortcuts (settings, appearance, log out) in a glass
 * popover. Closes on outside click or Escape and returns focus to the trigger.
 */
export function WorkspaceMenu({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Links a role cannot use are hidden (the pages enforce it regardless); account security is for everyone.
  const canConfigure = useCan('settings.write');
  const items: { href: string; label: string; icon: IconName }[] = [
    ...(canConfigure
      ? ([
          { href: '/settings', label: 'Business settings', icon: 'cog' },
          { href: '/settings/services', label: 'Services', icon: 'tag' },
          { href: '/settings/loyalty', label: 'Loyalty program', icon: 'gift' },
        ] as const)
      : []),
    { href: '/account/security', label: 'Account security & 2FA', icon: 'shield' },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`group flex w-full items-center gap-3 rounded-xl border p-2 text-left transition duration-200 ${
          open
            ? 'border-brand-500/40 bg-surface shadow-sm'
            : 'border-line bg-surface/60 shadow-xs hover:border-brand-500/30 hover:bg-surface'
        }`}
      >
        <Avatar name={name} src={logoUrl} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{name}</span>
          <span className="block truncate text-2xs text-ink-3">Workspace</span>
        </span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 flex-shrink-0 text-ink-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute inset-x-0 top-full z-50 mt-2 origin-top animate-palette-in overflow-hidden rounded-2xl border border-line bg-surface/95 p-1.5 shadow-pop backdrop-blur-xl"
        >
          <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-2">
            <Avatar name={name} src={logoUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
              <p className="text-xs text-ink-3">Owner</p>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />

          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-brand-500/10 hover:text-ink"
            >
              <Icon name={item.icon} className="h-4 w-4 text-ink-4" />
              {item.label}
            </Link>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              toggle();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-ink-2 transition-colors hover:bg-brand-500/10 hover:text-ink"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4 text-ink-4" />
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>

          <div className="my-1 h-px bg-line" />
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-ink-2 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
            >
              <Icon name="logout" className="h-4 w-4 text-ink-4" />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
