/**
 * Customer-data export for a business (Settings → Data & privacy).
 *
 * Runs with the signed-in user's own Supabase client, so row level security
 * decides what is included. Secrets are deliberately never exported:
 * `google_business_connections` (encrypted OAuth tokens) and `api_keys`
 * (key hashes) are not in the table list.
 */

/** Every table that holds business data, all keyed by `business_id`. */
export const EXPORT_TABLES = [
  'customers',
  'customer_tags',
  'services',
  'visits',
  'messages',
  'review_requests',
  'interaction_events',
  'click_events',
  'private_feedback',
  'journeys',
  'journey_enrollments',
  'segments',
  'loyalty_programs',
  'loyalty_ledger_entries',
  'referrals',
  'import_jobs',
  'integration_events',
  'google_reviews',
  'google_business_locations',
  'google_sync_jobs',
  'review_metrics_daily',
  'review_metrics',
  'review_sources',
  'manual_review_snapshots',
  'review_alerts',
  'subscriptions',
] as const;

export const PAGE_SIZE = 1000;

type PageResult = { data: unknown[] | null; error: { message: string } | null };
/** The one query shape the exporter needs; keeps it testable without Supabase. */
export type PageFetcher = (table: string, from: number, to: number) => PromiseLike<PageResult>;

/** Reads every row of a table. Supabase caps a single response at 1000 rows, so page through it. */
export async function fetchAllRows(fetchPage: PageFetcher, table: string): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(table, from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { rows };
  }
}

export type AccountExport = {
  exported_at: string;
  business: unknown;
  tables: Record<string, unknown[]>;
  /** Tables that could not be read (for example a migration that is not applied yet). */
  warnings: string[];
};

export async function buildExport(business: unknown, fetchPage: PageFetcher, now = new Date()): Promise<AccountExport> {
  const tables: Record<string, unknown[]> = {};
  const warnings: string[] = [];
  for (const table of EXPORT_TABLES) {
    const { rows, error } = await fetchAllRows(fetchPage, table);
    tables[table] = rows;
    if (error) warnings.push(`${table}: ${error}`);
  }
  return { exported_at: now.toISOString(), business, tables, warnings };
}

/**
 * One CSV cell. Quotes when needed, and neutralises spreadsheet formulas
 * (a customer called "=HYPERLINK(...)" must not run when the owner opens the
 * file in Excel) by prefixing a single quote.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

export const CUSTOMER_CSV_COLUMNS = [
  'name',
  'email',
  'phone',
  'date_of_birth',
  'last_service_date',
  'visit_count',
  'total_spend',
  'unsubscribed_at',
  'archived_at',
  'created_at',
];
