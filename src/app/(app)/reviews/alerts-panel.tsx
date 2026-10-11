'use client';

import { useTransition } from 'react';
import { Icon, type IconName } from '@/components/ui/icons';
import { formatUKDateTime } from '@/lib/uk-defaults';
import { markReviewAlertsRead } from './actions';

export type AlertItem = {
  id: string;
  type: 'new_review' | 'new_one_star' | 'low_rating' | 'rating_decrease';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

const STYLE: Record<AlertItem['type'], { icon: IconName; tone: string }> = {
  new_review: { icon: 'star', tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  new_one_star: { icon: 'warning', tone: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  low_rating: { icon: 'warning', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  rating_decrease: { icon: 'arrowDown', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
};

export function AlertsPanel({ alerts, unread }: { alerts: AlertItem[]; unread: number }) {
  const [pending, start] = useTransition();

  return (
    <div>
      {unread > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-3">{unread} unread</p>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(() => markReviewAlertsRead())}>
            Mark all as read
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {alerts.map((a) => {
          const style = STYLE[a.type];
          return (
            <li
              key={a.id}
              className={`flex items-start gap-3 rounded-xl border p-3 ${a.is_read ? 'border-line opacity-75' : 'border-brand-500/30 bg-brand-50/40 dark:bg-brand-500/5'}`}
            >
              <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${style.tone}`}>
                <Icon name={style.icon} className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {a.title}
                  {!a.is_read && <span className="sr-only"> (unread)</span>}
                </p>
                <p className="mt-0.5 break-words text-[13px] leading-5 text-ink-3">{a.message}</p>
              </div>
              <time dateTime={a.created_at} className="hidden flex-shrink-0 text-xs text-ink-4 sm:block">
                {formatUKDateTime(new Date(a.created_at))}
              </time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
