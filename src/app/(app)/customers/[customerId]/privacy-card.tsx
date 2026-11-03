'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { eraseCustomerAction } from './actions';

/**
 * Data-subject requests for one customer: download everything held about them (access) or erase them
 * permanently (erasure). Owners and admins only; the page decides whether to render this.
 */
export function PrivacyCard({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const matches = confirm.trim().toLowerCase() === customerName.trim().toLowerCase();

  function erase() {
    setError(null);
    start(async () => {
      const res = await eraseCustomerAction(customerId, confirm, keep);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink">
        <Icon name="shield" className="h-4 w-4 text-ink-4" />
        Privacy requests
      </h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-3">For when this customer asks what you hold about them, or asks you to delete it.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={`/api/customers/${customerId}/export`} className="btn btn-secondary btn-sm">
          <Icon name="download" className="h-3.5 w-3.5" />
          Download their data
        </a>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="btn btn-danger-ghost btn-sm">
            <Icon name="x" className="h-3.5 w-3.5" />
            Erase permanently
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3 rounded-xl border border-red-500/30 bg-red-500/[0.04] p-4">
          <p className="text-[13px] leading-5 text-ink-2">
            This deletes {customerName}, their visits, messages, link clicks, feedback, tags and loyalty points. It cannot be undone.
          </p>
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line-strong" />
            <span>Keep their email on your do-not-contact list, so a future import can never email them again.</span>
          </label>
          <div>
            <label htmlFor="erase-confirm" className="label">Type <span className="font-semibold">{customerName}</span> to confirm</label>
            <input id="erase-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="input mt-1.5" />
          </div>
          {error && <Notice variant="error">{error}</Notice>}
          <div className="flex gap-2">
            <button type="button" disabled={!matches || pending} onClick={erase} className="btn btn-sm border-red-600/50 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {pending && <Spinner className="h-3.5 w-3.5" />}
              Erase {customerName}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
