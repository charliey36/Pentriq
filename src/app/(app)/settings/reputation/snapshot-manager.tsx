'use client';

import { useState, useTransition } from 'react';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { deleteSnapshot, recalculateAnalytics, saveSnapshot, updateSnapshot, type ReputationResult } from './actions';

export type SnapshotRow = { id: string; date: string; count: number; rating: number; gained: number; change: number | null };

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const signed = (n: number, dp = 0) => `${n > 0 ? '+' : n < 0 ? '\u2212' : ''}${Math.abs(n).toFixed(dp)}`;

export function SnapshotManager({ rows, today }: { rows: SnapshotRow[]; today: string }) {
  const latest = rows[0];
  const [editing, setEditing] = useState<SnapshotRow | null>(null);
  const [date, setDate] = useState(today);
  const [count, setCount] = useState(latest ? String(latest.count) : '');
  const [rating, setRating] = useState(latest ? latest.rating.toFixed(1) : '');
  const [result, setResult] = useState<ReputationResult | null>(null);
  const [pending, start] = useTransition();

  function edit(row: SnapshotRow | null) {
    setEditing(row);
    setResult(null);
    if (row) {
      setDate(row.date);
      setCount(String(row.count));
      setRating(row.rating.toFixed(1));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const n = Number(count);
      const r = Number(rating || 0);
      const res = editing ? await updateSnapshot(editing.id, date, n, r) : await saveSnapshot(date, n, r);
      setResult(res);
      if (res.ok) setEditing(null);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
        <div>
          <label htmlFor="snap-date" className="label">Date</label>
          <input id="snap-date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className="input mt-1.5 w-full" />
        </div>
        <div>
          <label htmlFor="snap-count" className="label">Current review count</label>
          <input id="snap-count" type="number" inputMode="numeric" min={0} step={1} required value={count} onChange={(e) => setCount(e.target.value)} className="input mt-1.5 w-full" placeholder="47" />
        </div>
        <div>
          <label htmlFor="snap-rating" className="label">Current average rating</label>
          <input id="snap-rating" type="number" inputMode="decimal" min={0} max={5} step={0.1} required value={rating} onChange={(e) => setRating(e.target.value)} className="input mt-1.5 w-full" placeholder="4.6" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending && <Spinner />}
            {editing ? 'Update snapshot' : 'Save snapshot'}
          </button>
          {editing && (
            <button type="button" className="btn btn-ghost" onClick={() => edit(null)}>Cancel</button>
          )}
        </div>
      </form>
      {result && <Notice variant={result.ok ? 'success' : 'error'}>{result.message}</Notice>}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">History</h3>
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => setResult(await recalculateAnalytics()))}>
            Recalculate analytics
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-3">No snapshots yet. Enter the numbers you see on Google, Facebook or wherever your reviews live.</p>
        ) : (
          <div className="scroll-thin overflow-x-auto rounded-xl border border-line">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Reviews</th>
                  <th className="text-right">Gained</th>
                  <th className="text-right">Rating</th>
                  <th className="text-right">Change</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium text-ink">{fmtDate(r.date)}</td>
                    <td className="text-right tabular-nums">{r.count}</td>
                    <td className="text-right tabular-nums">{r.gained > 0 ? `+${r.gained}` : '\u2014'}</td>
                    <td className="text-right tabular-nums">{r.count === 0 ? '\u2014' : `${r.rating.toFixed(1)}\u2605`}</td>
                    <td className="text-right tabular-nums">{r.change === null || r.change === 0 ? '\u2014' : `${signed(r.change, 1)}\u2605`}</td>
                    <td className="whitespace-nowrap text-right">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(r)}>Edit</button>
                      <ConfirmActionButton label="Delete" ariaLabel={`Delete snapshot from ${fmtDate(r.date)}`} onConfirm={async () => setResult(await deleteSnapshot(r.id))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
