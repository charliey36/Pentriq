'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icons';
import { markReviewAlertsRead } from '@/app/(app)/reviews/actions';

export type NotificationItem = {
  id: string;
  kind: 'feedback' | 'alert' | 'failed' | 'held';
  title: string;
  detail?: string;
  /** Pre-formatted on the server so server and client render the same text. */
  when?: string;
  href: string;
  urgent?: boolean;
};

const KIND_ICON: Record<NotificationItem['kind'], IconName> = { feedback: 'chat', alert: 'star', failed: 'warning', held: 'clock' };
const KIND_TONE: Record<NotificationItem['kind'], string> = {
  feedback: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  alert: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  held: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
};

/**
 * Header bell: everything that needs the owner's attention, in one place, from any page. Counts come from
 * the layout's server render; the panel is a lightweight popover (Escape and outside-click close it).
 */
export function NotificationCenter({ items, total, unreadAlerts }: { items: NotificationItem[]; total: number; unreadAlerts: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={total > 0 ? `Notifications, ${total} need attention` : 'Notifications'}
        className="btn btn-ghost btn-icon relative"
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {total > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-50 w-[min(92vw,380px)] animate-pop-in overflow-hidden rounded-2xl border border-line bg-surface shadow-float"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Needs attention</p>
            {unreadAlerts > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markReviewAlertsRead();
                    router.refresh();
                  })
                }
                className="text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50 dark:text-brand-400"
              >
                Mark review alerts read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <Icon name="checkCircle" className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink">All caught up</p>
              <p className="mt-1 text-xs text-ink-3">New feedback, review alerts and failed sends will appear here.</p>
            </div>
          ) : (
            <ul className="scroll-thin max-h-[60vh] divide-y divide-line/70 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/60">
                    <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${KIND_TONE[item.kind]}`}>
                      <Icon name={KIND_ICON[item.kind]} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-ink">{item.title}</span>
                        {item.urgent && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold uppercase text-white">Urgent</span>}
                      </span>
                      {item.detail && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-ink-3">{item.detail}</span>}
                      {item.when && <span className="mt-0.5 block text-2xs text-ink-4">{item.when}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 border-t border-line text-center text-xs font-medium">
            <Link href="/insights" onClick={() => setOpen(false)} className="px-3 py-2.5 text-brand-700 hover:bg-surface-muted/60 dark:text-brand-400">
              Next best actions
            </Link>
            <Link href="/activity" onClick={() => setOpen(false)} className="border-l border-line px-3 py-2.5 text-ink-2 hover:bg-surface-muted/60">
              All activity
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
