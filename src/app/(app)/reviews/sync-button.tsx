'use client';

import { useState, useTransition } from 'react';
import { Spinner } from '@/components/ui/submit-button';
import { syncGoogleNow } from '../settings/integrations/google-actions';

export function SyncButton() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await syncGoogleNow();
            setMessage({ ok: res.ok, text: res.message });
          })
        }
      >
        {pending && <Spinner className="h-3.5 w-3.5" />}
        Sync now
      </button>
      {message && (
        <p role="status" className={`text-xs ${message.ok ? 'text-ink-3' : 'text-red-600 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
