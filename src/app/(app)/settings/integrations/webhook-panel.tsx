'use client';

import { useState, useTransition } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { deleteWebhook, rotateWebhookSecret, saveWebhook, sendTestWebhook, type WebhookActionResult } from './webhook-actions';

const EVENT_LABELS: Record<string, string> = {
  'customer.created': 'A customer is added',
  'feedback.received': 'A customer sends private feedback',
};

export type WebhookState = { url: string; events: string[]; isActive: boolean; disabledReason: string | null; lastSuccessAt: string | null } | null;

export function WebhookPanel({ initial, available }: { initial: WebhookState; available: string[] }) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [events, setEvents] = useState<string[]>(initial?.events ?? available);
  const [secret, setSecret] = useState<string | null>(null);
  const [result, setResult] = useState<WebhookActionResult | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<WebhookActionResult>) {
    start(async () => {
      const res = await fn();
      setResult(res);
      if (res.secret) setSecret(res.secret);
    });
  }

  return (
    <div className="space-y-4">
      {initial && !initial.isActive && <Notice variant="warning">{initial.disabledReason ?? 'This webhook is switched off.'} Save again to switch it back on.</Notice>}
      <div>
        <label htmlFor="webhook-url" className="label">Endpoint URL</label>
        <input id="webhook-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" className="input mt-1.5 font-mono text-sm" />
        <p className="field-hint">Must be https and reachable from the internet. Redirects are not followed.</p>
      </div>
      <fieldset>
        <legend className="label">Send an event when…</legend>
        <div className="mt-1.5 space-y-1.5">
          {available.map((e) => (
            <label key={e} className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={events.includes(e)} onChange={(ev) => setEvents((cur) => (ev.target.checked ? [...cur, e] : cur.filter((x) => x !== e)))} className="h-4 w-4 rounded border-line-strong accent-brand-600" />
              {EVENT_LABELS[e] ?? e} <code className="text-xs text-ink-4">{e}</code>
            </label>
          ))}
        </div>
      </fieldset>

      {secret && (
        <div>
          <label className="label">Signing secret</label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="input flex-1 select-all overflow-x-auto font-mono text-sm">{secret}</code>
            <CopyButton value={secret} />
          </div>
          <Notice variant="warning" className="mt-2">Copy this now: it is only shown once. Verify each request with HMAC-SHA256 of <code>{'{timestamp}.{body}'}</code> against the <code>Pentriq-Signature</code> header.</Notice>
        </div>
      )}
      <div aria-live="polite">
        {result?.error && <Notice variant="error">{result.error}</Notice>}
        {result?.success && result.message && <Notice variant="success">{result.message}</Notice>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => saveWebhook(url, events))}>
          {pending && <Spinner className="h-3.5 w-3.5" />}
          {initial ? 'Save changes' : 'Enable webhook'}
        </button>
        {initial && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(sendTestWebhook)}>Send test event</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => window.confirm('Generate a new signing secret? The old one stops working immediately.') && run(rotateWebhookSecret)}>Rotate secret</button>
            <button type="button" className="btn btn-danger-ghost btn-sm" disabled={pending} onClick={() => window.confirm('Delete this webhook?') && run(deleteWebhook)}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}
