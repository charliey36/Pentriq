import { describe, expect, it } from '@jest/globals';
import { preflightCsv } from '@/lib/csv-preflight';
import { bulkImportCustomers, validateImportRow } from '@/lib/customers';
import { MiniDb } from './helpers/mini-db';

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const H = ['name', 'email', 'service', 'date', 'amount'];

describe('preflightCsv', () => {
  it('reports a clean file as ready', () => {
    const r = preflightCsv([H, ['Sam', 'sam@x.com', 'Repair', day(1), '50'], ['Pri', 'pri@x.com', 'Repair', day(2), '60']]);
    expect(r).toMatchObject({ totalRows: 2, readyRows: 2, problemRows: 0, canImport: true, issues: [] });
  });

  it('gives row-level errors with spreadsheet row numbers and a fix for each', () => {
    const r = preflightCsv([H, ['Sam', 'not-an-email', 'Repair', day(1), '50'], ['', 'a@x.com', 'Repair', day(1), ''], ['Lee', 'lee@x.com', 'Repair', '31/02/2026', ''], ['Kim', 'kim@x.com', 'Repair', day(1), 'lots'], ['Ok', 'ok@x.com', 'Repair', day(1), '']]);
    expect(r.readyRows).toBe(1);
    expect(r.problemRows).toBe(4);
    expect(r.issues.map((i) => [i.row, i.field])).toEqual([[2, 'email'], [3, 'name'], [4, 'date'], [5, 'amount']]);
    expect(r.issues.every((i) => i.fix.length > 10)).toBe(true);
    expect(r.canImport).toBe(true);
    expect(r.fileMessages.some((m) => /will be skipped/.test(m.text))).toBe(true);
  });

  it('detects a missing required column and explains it', () => {
    const r = preflightCsv([['name', 'service'], ['Sam', 'Repair']]);
    expect(r.canImport).toBe(false);
    expect(r.fileMessages[0]).toMatchObject({ level: 'error' });
    expect(r.fileMessages[0].text).toMatch(/Missing required column: email/);
  });

  it('flags future dates, repeated rows and undated rows', () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const r = preflightCsv([H, ['A', 'a@x.com', 'Repair', future, ''], ['B', 'b@x.com', 'Repair', day(1), ''], ['B', 'b@x.com', 'Repair', day(1), ''], ['C', 'c@x.com', 'Repair', '', '']]);
    expect(r.issues[0].problem).toMatch(/future/);
    expect(r).toMatchObject({ readyRows: 2, duplicateRows: 1, undatedRows: 1 });
  });

  it('cannot import when every row is bad', () => {
    const r = preflightCsv([H, ['', '', '', '', '']]);
    expect(r.canImport).toBe(false);
    expect(r.fileMessages.some((m) => m.level === 'error')).toBe(true);
  });

  it('caps the listed issues but reports the real total', () => {
    const rows = [H, ...Array.from({ length: 150 }, (_, i) => [`N${i}`, 'bad', 'Repair', day(1), ''])];
    const r = preflightCsv(rows);
    expect(r.problemRows).toBe(150);
    expect(r.issues).toHaveLength(100);
    expect(r.issuesTruncated).toBe(true);
  });

  it('agrees with the import itself: what the preview calls bad, the import skips', async () => {
    const rows = [H, ['Sam', 'bad', 'Repair', day(1), ''], ['Ok', 'ok@x.com', 'Repair', day(1), '']];
    const pre = preflightCsv(rows);
    const db = new MiniDb();
    const summary = await bulkImportCustomers(db as never, { id: 'b', delay_hours: 2, review_request_window_days: 14 }, [
      { name: 'Sam', email: 'bad', service: 'Repair', date: day(1), phone: null, amountSpent: null },
      { name: 'Ok', email: 'ok@x.com', service: 'Repair', date: day(1), phone: null, amountSpent: null },
    ], false);
    expect(summary.errors).toBe(pre.problemRows);
    expect(summary.customersCreated).toBe(pre.readyRows);
  });

  it('validateImportRow explains every failure', () => {
    const bad = validateImportRow({ name: 'A', email: 'a@x.com', service: 'S', date: 'garbage', phone: null, amountSpent: null });
    expect(bad).toMatchObject({ ok: false, field: 'date' });
  });
});
