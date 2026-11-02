import Link from 'next/link';
import type { ReactNode } from 'react';

export type SegmentedItem = { key: string; label: ReactNode; href: string; count?: number; tone?: 'default' | 'danger' | 'warning' };

/**
 * Link-based segmented control (server-renderable, shareable URLs, works without JS). Use for views and
 * period pickers, e.g. Inbox views or the report period.
 */
export function SegmentedNav({ items, active, label, className = '' }: { items: SegmentedItem[]; active: string; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={`scroll-thin -mx-1 overflow-x-auto px-1 ${className}`}>
      <ul className="inline-flex gap-1 rounded-xl border border-line bg-surface-subtle/80 p-1 shadow-xs">
        {items.map((item) => {
          const isActive = item.key === active;
          const countTone =
            item.tone === 'danger' ? 'bg-rose-500 text-white' : item.tone === 'warning' ? 'bg-amber-500 text-white' : isActive ? 'bg-surface-muted text-ink-2' : 'bg-surface-muted/70 text-ink-4';
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                scroll={false}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                  isActive ? 'bg-surface text-ink shadow-xs ring-1 ring-inset ring-line-strong' : 'text-ink-3 hover:bg-surface hover:text-ink'
                }`}
              >
                {item.label}
                {typeof item.count === 'number' && (
                  <span className={`min-w-[20px] rounded-full px-1.5 text-center text-2xs font-semibold tabular-nums ${countTone}`}>{item.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
