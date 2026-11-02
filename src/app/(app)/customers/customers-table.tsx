'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, requestStatusTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/submit-button';
import { useToast } from '@/components/toast';
import {
  PAGE_SIZE,
  BULK_LIMIT,
  actionableIds,
  applyList,
  countByFilter,
  parseListState,
  rowsToCsv,
  serializeListState,
  type ListRow,
  type ListState,
  type SortKey,
  type StatusFilter,
} from '@/lib/customer-list';
import { ReviewRowActions } from './review-row-actions';
import { cancelSelectedReviews, sendSelectedReviews } from './actions';

export type CustomerRow = ListRow;

const filters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'held', label: 'Held' },
  { key: 'pending', label: 'Scheduled' },
  { key: 'sent', label: 'Sent' },
  { key: 'failed', label: 'Failed' },
  { key: 'none', label: 'None' },
];

function SortHeader({ label, k, state, onSort, className = '' }: { label: string; k: SortKey; state: ListState; onSort: (k: SortKey) => void; className?: string }) {
  const active = state.sort === k;
  return (
    <th className={className} aria-sort={active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 rounded font-semibold hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-500/40">
        {label}
        <Icon name={active && state.dir === 'asc' ? 'arrowUp' : 'arrowDown'} className={`h-3 w-3 ${active ? 'text-ink' : 'text-ink-4 opacity-40'}`} />
      </button>
    </th>
  );
}

const Row = memo(function Row({ row, selected, onToggle, onOpen }: { row: CustomerRow; selected: boolean; onToggle: (id: string) => void; onOpen: (id: string) => void }) {
  return (
    <tr
      className={`group cursor-pointer ${selected ? 'bg-brand-500/[0.06]' : ''}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button, input, label')) return;
        onOpen(row.id);
      }}
    >
      <td className="w-10 pr-0">
        <input type="checkbox" checked={selected} onChange={() => onToggle(row.id)} aria-label={`Select ${row.name}`} className="h-4 w-4 rounded border-line-strong accent-brand-600" />
      </td>
      <td>
        <Link href={`/customers/${row.id}`} className="flex items-center gap-3 rounded-md">
          <Avatar name={row.name} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{row.name}</span>
            <span className="block truncate text-[13px] text-ink-3">{row.email}</span>
          </span>
        </Link>
      </td>
      <td className="hidden whitespace-nowrap text-ink-3 sm:table-cell">{row.addedLabel}</td>
      <td>
        {row.status ? (
          <div className="flex flex-col items-start gap-1">
            <Badge tone={requestStatusTone(row.status)} dot className="capitalize">{row.status}</Badge>
            <span className="text-xs text-ink-3">{row.requestLabel}</span>
          </div>
        ) : (
          <span className="text-[13px] text-ink-4">No review request</span>
        )}
      </td>
      <td className="text-right">
        {row.messageId && <ReviewRowActions messageId={row.messageId} />}
        <Icon name="chevronRight" className="ml-auto h-4 w-4 text-ink-4 opacity-0 transition duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" />
      </td>
    </tr>
  );
});

/**
 * Customer list: instant multi-term search ("/" focuses it), status filters with counts, sortable columns,
 * shareable URL state, 50-row pages (so thousands of customers never mean thousands of DOM rows), row selection
 * with bulk send/cancel, and CSV export of the current view (owners and admins only; `canExport`).
 * Everything runs client-side over the rows the server already loaded.
 */
export function CustomersTable({ rows, canExport = false }: { rows: CustomerRow[]; canExport?: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [state, setState] = useState<ListState>(() => parseListState(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)));
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  // Reflect the view in the URL (replace, so Back doesn't step through every keystroke) and reset paging.
  useEffect(() => {
    const qs = serializeListState(state);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url);
  }, [state]);

  // "/" jumps to search (unless the user is already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const update = useCallback((patch: Partial<ListState>) => {
    setState((s) => ({ ...s, ...patch }));
    setLimit(PAGE_SIZE);
  }, []);
  const onSort = useCallback((k: SortKey) => setState((s) => (s.sort === k ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { ...s, sort: k, dir: k === 'name' ? 'asc' : 'desc' })), []);
  const onToggle = useCallback((id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const onOpen = useCallback((id: string) => router.push(`/customers/${id}`), [router]);

  const counts = useMemo(() => countByFilter(rows), [rows]);
  const matched = useMemo(() => applyList(rows, state), [rows, state]);
  const visible = useMemo(() => matched.slice(0, limit), [matched, limit]);
  const isFiltering = state.query.trim() !== '' || state.filter !== 'all';

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggleAllVisible = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allVisibleSelected) visible.forEach((r) => n.delete(r.id)); else visible.forEach((r) => n.add(r.id));
    return n;
  });
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const sendable = useMemo(() => actionableIds(rows, selected), [rows, selected]);

  function runBulk(fn: (ids: string[]) => Promise<{ message: string }>, ids: string[]) {
    startTransition(async () => {
      const res = await fn(ids.slice(0, BULK_LIMIT));
      push({ variant: 'info', title: res.message });
      setSelected(new Set());
    });
  }

  function exportCsv(list: CustomerRow[]) {
    const blob = new Blob([rowsToCsv(list)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
          <input
            ref={searchRef}
            type="search"
            value={state.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Search name or email   ( / )"
            aria-label="Search customers"
            aria-keyshortcuts="/"
            className="input pl-9"
          />
        </div>
        <div role="group" aria-label="Filter by review request status" className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 py-0.5">
          {filters.map((item) => {
            const active = state.filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => update({ filter: item.key })}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                  active ? 'bg-surface-muted text-ink ring-1 ring-inset ring-line-strong' : 'text-ink-3 hover:bg-surface-subtle hover:text-ink'
                }`}
              >
                {item.label}
                <span className={`text-xs tabular-nums ${active ? 'text-ink-3' : 'text-ink-4'}`}>{counts[item.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-500/[0.07] px-5 py-2.5 sm:px-6">
          <span className="text-sm font-medium text-ink">{selected.size} selected</span>
          <span className="flex-1" />
          {sendable.length > 0 && (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => runBulk(sendSelectedReviews, sendable)}>
                {pending && <Spinner className="h-3.5 w-3.5" />}
                Send {Math.min(sendable.length, BULK_LIMIT)} now
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => runBulk(cancelSelectedReviews, sendable)}>Cancel requests</button>
            </>
          )}
          {canExport && <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportCsv(selectedRows)}>Export selected</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          {sendable.length > BULK_LIMIT && <p className="basis-full text-xs text-ink-3">Bulk sends are limited to {BULK_LIMIT} at a time; run it again for the rest.</p>}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="users"
          title="No customers yet"
          description="Add your first customer to begin sending review requests."
          action={
            <>
              <Link href="/customers?add=1" className="btn btn-primary">Add Customer</Link>
              <Link href="/customers/import" className="btn btn-secondary"><Icon name="upload" className="h-4 w-4" />Import CSV</Link>
            </>
          }
        />
      ) : matched.length === 0 ? (
        <EmptyState
          icon="search"
          title="No customers match"
          description="Try a different search term or status filter."
          action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ query: '', filter: 'all' })}>Clear filters</button>}
          className="py-12"
        />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="data-table data-table-hover">
            <thead>
              <tr>
                <th className="w-10 pr-0">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all shown customers" className="h-4 w-4 rounded border-line-strong accent-brand-600" />
                </th>
                <SortHeader label="Customer" k="name" state={state} onSort={onSort} />
                <SortHeader label="Added" k="added" state={state} onSort={onSort} className="hidden sm:table-cell" />
                <SortHeader label="Review request" k="status" state={state} onSort={onSort} />
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Row key={row.id} row={row} selected={selected.has(row.id)} onToggle={onToggle} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-subtle px-5 py-3 text-xs text-ink-3 sm:px-6" aria-live="polite">
          <span>
            {isFiltering
              ? `${matched.length.toLocaleString('en-GB')} of ${rows.length.toLocaleString('en-GB')} customers match`
              : `${rows.length.toLocaleString('en-GB')} ${rows.length === 1 ? 'customer' : 'customers'}`}
            {matched.length > visible.length && ` · showing ${visible.length.toLocaleString('en-GB')}`}
          </span>
          {matched.length > visible.length && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, matched.length - visible.length)} more
            </button>
          )}
          <span className="flex-1" />
          {canExport && matched.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportCsv(matched)}>
              <Icon name="arrowDown" className="h-3.5 w-3.5" />
              Export {isFiltering ? 'filtered' : 'all'} (CSV)
            </button>
          )}
        </div>
      )}
    </section>
  );
}
