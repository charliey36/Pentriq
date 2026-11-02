/**
 * Reads EVERY row of a query. Supabase/PostgREST caps a single response at 1000 rows and does not say
 * so, which silently truncates lists, analytics and automated jobs for any business with more data.
 *
 * `build(from, to)` must return the query with `.range(from, to)` applied AND a deterministic
 * `.order(...)` (otherwise pages can overlap or skip rows). Throws on a database error rather than
 * returning a partial result that looks complete.
 */
type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export const FETCH_PAGE_SIZE = 1000;
/** Safety valve so a runaway table cannot exhaust server memory. */
export const FETCH_MAX_ROWS = 200_000;

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = FETCH_PAGE_SIZE,
  maxRows = FETCH_MAX_ROWS
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** Splits ids into chunks so `.in('id', chunk)` stays under URL length limits. */
export function chunkIds<T>(ids: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
