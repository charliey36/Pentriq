/**
 * Pure list logic for the customers screen (filter, sort, paginate, export, URL state), kept out of the
 * component so it is unit-tested and the table stays a thin view.
 */
import { toCsv } from '@/lib/account-export';

export type ListRow = {
  id: string;
  name: string;
  email: string;
  addedLabel: string;
  /** ISO timestamp, used for sorting (addedLabel is display-only). */
  addedAt: string;
  status: string | null;
  requestLabel: string | null;
  messageId: string | null;
};

export const STATUS_FILTERS = ['all', 'held', 'pending', 'sent', 'failed', 'none'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const SORT_KEYS = ['added', 'name', 'status'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export type ListState = { query: string; filter: StatusFilter; sort: SortKey; dir: SortDir };
export const DEFAULT_STATE: ListState = { query: '', filter: 'all', sort: 'added', dir: 'desc' };
export const PAGE_SIZE = 50;
/** Most requests one bulk action may touch (matches the server-side cap). */
export const BULK_LIMIT = 25;

export function matchesFilter(row: Pick<ListRow, 'status'>, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return row.status === null;
  return row.status === filter;
}

/** Every whitespace-separated term must appear in the name or email (so "ann smith" or "smith gmail" both work). */
export function matchesQuery(row: Pick<ListRow, 'name' | 'email'>, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${row.name} ${row.email}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

const STATUS_ORDER: Record<string, number> = { failed: 0, held: 1, pending: 2, sent: 3 };

export function sortRows<T extends ListRow>(rows: T[], sort: SortKey, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a: T, b: T) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' });
    if (sort === 'status') return (STATUS_ORDER[a.status ?? ''] ?? 9) - (STATUS_ORDER[b.status ?? ''] ?? 9);
    return a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0;
  };
  // Stable tie-break on id so equal rows never shuffle between renders.
  return [...rows].sort((a, b) => sign * cmp(a, b) || a.id.localeCompare(b.id));
}

export function applyList<T extends ListRow>(rows: T[], state: ListState): T[] {
  return sortRows(rows.filter((r) => matchesFilter(r, state.filter) && matchesQuery(r, state.query)), state.sort, state.dir);
}

export function countByFilter(rows: Pick<ListRow, 'status'>[]): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { all: rows.length, held: 0, pending: 0, sent: 0, failed: 0, none: 0 };
  for (const r of rows) {
    if (r.status === null) out.none += 1;
    else if (r.status === 'held' || r.status === 'pending' || r.status === 'sent' || r.status === 'failed') out[r.status] += 1;
  }
  return out;
}

/** Reads list state from a query string, ignoring anything unrecognised so a hand-edited URL can never break the page. */
export function parseListState(params: URLSearchParams): ListState {
  const filter = params.get('status') as StatusFilter | null;
  const sort = params.get('sort') as SortKey | null;
  const dir = params.get('dir');
  return {
    query: (params.get('q') ?? '').slice(0, 100),
    filter: filter && (STATUS_FILTERS as readonly string[]).includes(filter) ? filter : DEFAULT_STATE.filter,
    sort: sort && (SORT_KEYS as readonly string[]).includes(sort) ? sort : DEFAULT_STATE.sort,
    dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_STATE.dir,
  };
}

/** Only non-default values are written, so the default view keeps a clean URL. */
export function serializeListState(state: ListState): string {
  const p = new URLSearchParams();
  if (state.query.trim()) p.set('q', state.query.trim());
  if (state.filter !== DEFAULT_STATE.filter) p.set('status', state.filter);
  if (state.sort !== DEFAULT_STATE.sort) p.set('sort', state.sort);
  if (state.dir !== DEFAULT_STATE.dir) p.set('dir', state.dir);
  return p.toString();
}

/** CSV of the visible list. Cell escaping (including spreadsheet-formula neutralisation) is shared with the account export. */
export function rowsToCsv(rows: Pick<ListRow, 'name' | 'email' | 'addedLabel' | 'status' | 'requestLabel'>[]): string {
  return toCsv(
    rows.map((r) => ({ name: r.name, email: r.email, added: r.addedLabel, status: r.status ?? 'none', detail: r.requestLabel ?? '' })),
    ['name', 'email', 'added', 'status', 'detail']
  ).replace(/^name,email,added,status,detail/, 'Name,Email,Added,Review request status,Review request detail');
}

/** Message ids of the selected rows whose request is still scheduled or held (the only ones a bulk send/cancel can act on). */
export function actionableIds(all: Pick<ListRow, 'id' | 'messageId' | 'status'>[], selected: ReadonlySet<string>): string[] {
  return all.filter((r) => selected.has(r.id) && r.messageId && (r.status === 'held' || r.status === 'pending')).map((r) => r.messageId as string);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a client-supplied id list for bulk actions: strings only, UUID-shaped, de-duplicated, capped at BULK_LIMIT. */
export function cleanMessageIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v)))).slice(0, BULK_LIMIT);
}
