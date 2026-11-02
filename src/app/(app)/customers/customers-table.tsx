'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, requestStatusTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icons';
import { ReviewRowActions } from './review-row-actions';

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  addedLabel: string;
  status: string | null;
  requestLabel: string | null;
  /** Set while a review request is scheduled or held and can be sent/cancelled. */
  messageId: string | null;
};

const filters = [
  { key: 'all', label: 'All' },
  { key: 'held', label: 'Held' },
  { key: 'pending', label: 'Scheduled' },
  { key: 'sent', label: 'Sent' },
  { key: 'failed', label: 'Failed' },
  { key: 'none', label: 'None' },
] as const;

type FilterKey = (typeof filters)[number]['key'];

function matchesFilter(row: CustomerRow, filter: FilterKey) {
  if (filter === 'all') return true;
  if (filter === 'none') return row.status === null;
  return row.status === filter;
}

/**
 * Customer list with instant search and status filters. Everything is
 * client-side over the rows the server already loaded, so there is no extra
 * round trip. Rows are fully clickable; the name remains a real link for
 * keyboard and screen-reader users.
 */
export function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const counts = useMemo(() => {
    const result: Record<FilterKey, number> = { all: rows.length, held: 0, pending: 0, sent: 0, failed: 0, none: 0 };
    for (const row of rows) {
      if (row.status === null) result.none += 1;
      else if (row.status === 'held' || row.status === 'pending' || row.status === 'sent' || row.status === 'failed') result[row.status] += 1;
    }
    return result;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        matchesFilter(row, filter) &&
        (!needle || row.name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle))
    );
  }, [rows, query, filter]);

  const isFiltering = query.trim() !== '' || filter !== 'all';

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            aria-label="Search customers"
            className="input pl-9"
          />
        </div>

        <div
          role="group"
          aria-label="Filter by review request status"
          className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 py-0.5"
        >
          {filters.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-surface-muted text-ink ring-1 ring-inset ring-line-strong'
                    : 'text-ink-3 hover:bg-surface-subtle hover:text-ink'
                }`}
              >
                {item.label}
                <span className={`text-xs tabular-nums ${active ? 'text-ink-3' : 'text-ink-4'}`}>
                  {counts[item.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="users"
          title="No customers yet"
          description="Add your first customer to begin sending review requests."
          action={
            <>
            <Link href="/customers?add=1" className="btn btn-primary">
              Add Customer
            </Link>
            <Link href="/customers/import" className="btn btn-secondary">
              <Icon name="upload" className="h-4 w-4" />
              Import CSV
            </Link>
            </>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="No customers match"
          description="Try a different search term or status filter."
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Clear filters
            </button>
          }
          className="py-12"
        />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="data-table data-table-hover">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="hidden sm:table-cell">Added</th>
                <th>Review request</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="group cursor-pointer"
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('a, button')) return;
                    router.push(`/customers/${row.id}`);
                  }}
                >
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
                        <Badge tone={requestStatusTone(row.status)} dot className="capitalize">
                          {row.status}
                        </Badge>
                        <span className="text-xs text-ink-3">{row.requestLabel}</span>
                      </div>
                    ) : (
                      <span className="text-[13px] text-ink-4">No review request</span>
                    )}
                  </td>
                  <td className="text-right">
                    {row.messageId && <ReviewRowActions messageId={row.messageId} />}
                    <Icon
                      name="chevronRight"
                      className="ml-auto h-4 w-4 text-ink-4 opacity-0 transition duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border-t border-line bg-surface-subtle px-5 py-3 text-xs text-ink-3 sm:px-6">
          {isFiltering
            ? `Showing ${visible.length.toLocaleString('en-GB')} of ${rows.length.toLocaleString('en-GB')} customers`
            : `${rows.length.toLocaleString('en-GB')} ${rows.length === 1 ? 'customer' : 'customers'}`}
        </div>
      )}
    </section>
  );
}
