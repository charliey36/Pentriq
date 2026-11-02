'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import { Icon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/submit-button';
import { sendSegmentCampaign } from './actions';

/** Campaign + export controls for a previewed or saved segment. Sending asks for a second click to confirm. */
export function PreviewActions({
  rulesJson,
  reachable,
  canSend,
  csv,
  filename,
}: {
  rulesJson: string;
  reachable: number;
  canSend: boolean;
  csv: string | null;
  filename: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<'rebooking' | 'review' | null>(null);
  const [running, setRunning] = useState<'rebooking' | 'review' | null>(null);

  function send(kind: 'rebooking' | 'review') {
    if (confirm !== kind) {
      setConfirm(kind);
      return;
    }
    setConfirm(null);
    setRunning(kind);
    startTransition(async () => {
      const result = await sendSegmentCampaign(rulesJson, kind).catch(() => ({ ok: false, message: 'Something went wrong.', sent: 0, failed: 0, skipped: 0 }));
      setRunning(null);
      push({ variant: result.ok ? 'success' : 'error', title: result.ok ? 'Campaign sent' : 'Campaign not sent', description: result.message });
      router.refresh();
    });
  }

  function download() {
    if (!csv) return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const batchNote = reachable > 25 ? ' (first 25)' : '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSend && (
        <>
          <button type="button" disabled={pending || reachable === 0} onClick={() => send('rebooking')} className={`btn btn-sm ${confirm === 'rebooking' ? 'btn-primary' : 'btn-secondary'}`}>
            {running === 'rebooking' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="calendar" className="h-3.5 w-3.5" />}
            {confirm === 'rebooking' ? `Confirm: send to ${Math.min(25, reachable)}` : `Send rebooking reminder${batchNote}`}
          </button>
          <button type="button" disabled={pending || reachable === 0} onClick={() => send('review')} className={`btn btn-sm ${confirm === 'review' ? 'btn-primary' : 'btn-secondary'}`}>
            {running === 'review' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="star" className="h-3.5 w-3.5" />}
            {confirm === 'review' ? `Confirm: ask ${Math.min(25, reachable)} for a review` : `Ask for reviews${batchNote}`}
          </button>
        </>
      )}
      {csv && (
        <button type="button" onClick={download} className="btn btn-ghost btn-sm">
          <Icon name="download" className="h-3.5 w-3.5" />
          Export CSV
        </button>
      )}
      {confirm && (
        <button type="button" onClick={() => setConfirm(null)} className="btn btn-ghost btn-sm">
          Cancel
        </button>
      )}
    </div>
  );
}
