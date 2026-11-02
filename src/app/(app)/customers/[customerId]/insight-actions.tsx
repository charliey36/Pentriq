'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import { Icon, type IconName } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/submit-button';
import { sendManualRebookingReminder, sendManualReviewRequest } from './actions';

type ActionId = 'send_rebooking' | 'send_review' | 'win_back' | 'log_visit' | 'follow_up_feedback' | 'reward' | 'resubscribe_note';

const BUTTONS: Partial<Record<ActionId, { label: string; icon: IconName; kind: 'rebooking' | 'review' | 'link'; href?: string }>> = {
  send_rebooking: { label: 'Send rebooking reminder', icon: 'calendar', kind: 'rebooking' },
  win_back: { label: 'Send win-back reminder', icon: 'heart', kind: 'rebooking' },
  send_review: { label: 'Ask for a review', icon: 'star', kind: 'review' },
  log_visit: { label: 'Log a visit', icon: 'plus', kind: 'link', href: '#log-visit' },
  follow_up_feedback: { label: 'Open their feedback', icon: 'chat', kind: 'link', href: '/feedback-inbox' },
};

/** One-click versions of the insight panel's recommendations, using the same send pipeline as the menu. */
export function InsightActions({ customerId, actions }: { customerId: string; actions: ActionId[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<ActionId | null>(null);
  const usable = actions.filter((a) => BUTTONS[a]);
  if (usable.length === 0) return null;

  function run(id: ActionId) {
    const spec = BUTTONS[id];
    if (!spec || spec.kind === 'link') return;
    setRunning(id);
    startTransition(async () => {
      const result = spec.kind === 'rebooking' ? await sendManualRebookingReminder(customerId) : await sendManualReviewRequest(customerId);
      setRunning(null);
      if (result.error) push({ variant: 'error', title: result.error });
      else {
        push({ variant: 'success', title: result.message ?? 'Sent' });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {usable.map((id) => {
        const spec = BUTTONS[id]!;
        return spec.kind === 'link' ? (
          <a key={id} href={spec.href} className="btn btn-secondary btn-sm">
            <Icon name={spec.icon} className="h-3.5 w-3.5" />
            {spec.label}
          </a>
        ) : (
          <button key={id} type="button" disabled={pending} onClick={() => run(id)} className="btn btn-primary btn-sm">
            {running === id ? <Spinner className="h-3.5 w-3.5" /> : <Icon name={spec.icon} className="h-3.5 w-3.5" />}
            {spec.label}
          </button>
        );
      })}
    </div>
  );
}
