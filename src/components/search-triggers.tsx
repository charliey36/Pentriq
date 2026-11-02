'use client';

import { useCommandPalette } from '@/components/command-palette';
import { Icon } from '@/components/ui/icons';

/** Sidebar search field: opens the command palette (it is not a real input). */
export function SidebarSearch() {
  const { open, isMac } = useCommandPalette();

  return (
    <button
      type="button"
      onClick={() => open()}
      className="group flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface/60 px-3 py-2 text-left text-[13px] text-ink-3 shadow-xs transition duration-200 hover:border-brand-500/40 hover:bg-surface hover:text-ink"
    >
      <Icon name="search" className="h-4 w-4 text-ink-4 transition-colors group-hover:text-brand-600" />
      <span className="flex-1">Search or jump to…</span>
      <kbd className="rounded-md border font-sans border-line-strong bg-surface-muted px-1.5 py-0.5 text-2xs font-medium text-ink-3">
        {isMac ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  );
}

/** Compact header trigger for the palette (always available, esp. when the sidebar is collapsed). */
export function HeaderSearchButton() {
  const { open } = useCommandPalette();

  return (
    <button type="button" onClick={() => open()} aria-label="Search or jump to…" title="Search (⌘K)" className="btn btn-ghost btn-icon">
      <Icon name="search" className="h-[18px] w-[18px]" />
    </button>
  );
}
