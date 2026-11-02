import type { ReactNode } from 'react';

/** A keyboard key, for shortcut hints. */
export function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-line-strong bg-surface-muted px-1.5 font-sans text-2xs font-semibold text-ink-3 shadow-[inset_0_-1px_0_0_rgb(var(--line-strong))] ${className}`}
    >
      {children}
    </kbd>
  );
}
