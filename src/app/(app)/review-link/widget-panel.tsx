'use client';

import { useState, useTransition } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { Notice } from '@/components/ui/notice';
import { setWidgetEnabled } from './actions';

export function WidgetPanel({ enabled: initial, snippet, previewUrl }: { enabled: boolean; snippet: string; previewUrl: string }) {
  const [enabled, setEnabled] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !enabled;
    setError(null);
    start(async () => {
      const res = await setWidgetEnabled(next);
      if (res.error) setError(res.error);
      else setEnabled(next);
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 text-sm text-ink-2">
        <input type="checkbox" checked={enabled} disabled={pending} onChange={toggle} className="mt-1 h-4 w-4 rounded border-line-strong" />
        <span>
          <strong className="text-ink">Show my recent 4 and 5 star Google reviews on my website.</strong>
          <br />
          Only reviews that are already public on Google, with written comments, are shown. It includes a small “Collected with Pentriq” credit. You can switch it off at any time.
        </span>
      </label>
      {error && <Notice variant="error">{error}</Notice>}
      {enabled && (
        <div className="space-y-2">
          <p className="text-sm text-ink-3">Paste this into your website where you want the reviews to appear:</p>
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-3 text-xs text-ink-2">{snippet}</pre>
          <div className="flex flex-wrap gap-3">
            <CopyButton value={snippet} label="Copy embed code" />
            <a href={previewUrl} target="_blank" rel="noopener" className="btn btn-secondary">Preview</a>
          </div>
          <p className="text-xs text-ink-4">Needs Google reviews synced (Settings → Integrations). The widget stays hidden until at least one 4 or 5 star review with text exists.</p>
        </div>
      )}
    </div>
  );
}
