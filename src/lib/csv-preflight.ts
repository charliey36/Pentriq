/**
 * Pre-import check: shows the owner, before anything is written, which rows will
 * import, which will not and exactly how to fix them. Uses the same mapping and
 * the same row rules (`validateImportRow`) as the import, so the preview matches.
 */
import { mapCsvRowsToCustomers, validateImportRow, type ImportField } from '@/lib/customers';
import type { CsvConfirmedMapping } from '@/lib/csv-import-mapping';

export type PreflightIssue = { row: number; name: string; email: string; field: ImportField; problem: string; fix: string };

export type CsvPreflight = {
  totalRows: number;
  readyRows: number;
  problemRows: number;
  /** Repeated rows (same email, service and date) that will be skipped. */
  duplicateRows: number;
  /** Rows without a service date: customer is added but no review request is created. */
  undatedRows: number;
  issues: PreflightIssue[];
  /** File-level problems and advice (missing columns, no date column...). */
  fileMessages: Array<{ level: 'error' | 'warning'; text: string }>;
  /** True when at least one row can be imported and there is no file-level error. */
  canImport: boolean;
  /** Only the first MAX_LISTED issues are returned; this is the real total. */
  issuesTruncated: boolean;
};

const MAX_LISTED = 100;

export function preflightCsv(rows: string[][], confirmedMapping?: CsvConfirmedMapping): CsvPreflight {
  const mapped = mapCsvRowsToCustomers(rows, confirmedMapping);
  const base: CsvPreflight = { totalRows: Math.max(0, rows.length - 1), readyRows: 0, problemRows: 0, duplicateRows: 0, undatedRows: 0, issues: [], fileMessages: [], canImport: false, issuesTruncated: false };

  if (mapped.error) {
    return { ...base, fileMessages: [{ level: 'error', text: mapped.error }] };
  }
  if (mapped.warning) base.fileMessages.push({ level: 'warning', text: mapped.warning });

  const seen = new Set<string>();
  let problems = 0;
  mapped.rows.forEach((r, i) => {
    const check = validateImportRow(r);
    if (!check.ok) {
      problems += 1;
      if (base.issues.length < MAX_LISTED) {
        // Row numbers match the spreadsheet: header is row 1, first customer is row 2.
        base.issues.push({ row: i + 2, name: check.name, email: check.email, field: check.field, problem: check.reason, fix: check.fix });
      }
      return;
    }
    const key = `${check.email}|${check.service.toLowerCase()}|${check.date ?? 'no-date'}`;
    if (seen.has(key)) {
      base.duplicateRows += 1;
      return;
    }
    seen.add(key);
    base.readyRows += 1;
    if (!check.date) base.undatedRows += 1;
  });

  base.problemRows = problems;
  base.issuesTruncated = problems > base.issues.length;
  base.canImport = base.readyRows > 0;
  if (problems > 0 && base.readyRows > 0) {
    base.fileMessages.push({ level: 'warning', text: `${problems} row${problems === 1 ? '' : 's'} will be skipped. You can import the ${base.readyRows} good row${base.readyRows === 1 ? '' : 's'} now and fix the rest later, or fix the file and analyse again.` });
  }
  if (base.readyRows === 0) {
    base.fileMessages.push({ level: 'error', text: 'No rows can be imported yet. Fix the problems listed below and upload the file again.' });
  }
  return base;
}
