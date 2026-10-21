import { describe, expect, it } from '@jest/globals';
import { mapCsvRowsToCustomers, parseCsv, parseCsvWithIssues } from '@/lib/customers';
import { analyzeCsvMapping } from '@/lib/csv-import-mapping';
import { safeNextPath } from '@/lib/safe-redirect';
import { errorReason, maskEmail, userSafeError } from '@/lib/log';
import { renderWelcomeEmail } from '@/lib/email-templates/welcome';
import { parseSettingsForm } from '@/lib/settings-validation';

describe('CSV parsing resilience', () => {
  it('handles empty input and blank rows', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n,,\n')).toEqual([]);
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it.each([
    ['semicolon', 'name;email;date\nAl;al@x.com;2026-01-01', ['name', 'email', 'date']],
    ['tab', 'name\temail\tdate\nAl\tal@x.com\t2026-01-01', ['name', 'email', 'date']],
    ['pipe', 'name|email|date\nAl|al@x.com|2026-01-01', ['name', 'email', 'date']],
  ])('detects %s-separated exports', (_n, text, header) => {
    expect(parseCsv(text)[0]).toEqual(header);
    expect(parseCsv(text)[1][1]).toBe('al@x.com');
  });
  it('keeps commas inside quotes and tolerates a BOM and CRLF', () => {
    const rows = parseCsv('\ufeffName,Email\r\n"Smith, Al",al@x.com\r\n');
    expect(rows).toEqual([['Name', 'Email'], ['Smith, Al', 'al@x.com']]);
  });
  it('flags an unterminated quote and binary content instead of silently swallowing the file', () => {
    expect(parseCsvWithIssues('Name,Email\n"Al,al@x.com\nBo,bo@x.com').unterminatedQuote).toBe(true);
    expect(parseCsvWithIssues('PK\u0000\u0003binary').binary).toBe(true);
    expect(parseCsvWithIssues('Name,Email\nAl,al@x.com').unterminatedQuote).toBe(false);
  });
  it('parses 120,000 rows quickly and without crashing', () => {
    const lines = ['Name,Email,Service,Date'];
    for (let i = 0; i < 120_000; i++) lines.push(`Person ${i},p${i}@x.com,Haircut,2026-01-01`);
    const t = Date.now();
    const rows = parseCsv(lines.join('\n'));
    expect(rows).toHaveLength(120_001);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});

describe('column mapping robustness', () => {
  it('reports a clear error when name or email cannot be found', () => {
    expect(analyzeCsvMapping([['Foo', 'Bar'], ['1', '2']])).toHaveProperty('error');
    expect(analyzeCsvMapping([])).toHaveProperty('error');
  });
  it('ignores extra columns and reports missing optional ones as unmapped', () => {
    const r = analyzeCsvMapping([['Notes', 'Client', 'E-mail', 'Colour'], ['x', 'Al Smith', 'al@x.com', 'red']]);
    if ('error' in r) throw new Error(r.error);
    expect(r.mappings.name.header).toBe('Client');
    expect(r.mappings.date.columnIndex).toBeNull();
  });
  it('mapCsvRowsToCustomers copes with ragged rows and missing columns', () => {
    const out = mapCsvRowsToCustomers([['name', 'email'], ['Al', 'al@x.com'], ['Bo'], ['', '']]);
    expect(out.error).toBeUndefined();
    expect(out.rows.length).toBeGreaterThanOrEqual(1);
    expect(mapCsvRowsToCustomers([['foo', 'bar'], ['1', '2']]).error).toBeTruthy();
  });
});

describe('security helpers', () => {
  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '/ok\n//evil', '', null])('safeNextPath rejects %p', (v) => {
    expect(safeNextPath(v as string | null)).toBe('/dashboard');
  });
  it('safeNextPath keeps real in-app paths', () => {
    expect(safeNextPath('/reset-password')).toBe('/reset-password');
    expect(safeNextPath('/customers?x=1')).toBe('/customers?x=1');
  });
  it('masks emails in logs and never leaks DB wording to users', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@example.com');
    expect(maskEmail('')).toBe('');
    const msg = userSafeError('Could not archive customer', { message: 'duplicate key value violates constraint "x"' });
    expect(msg).not.toMatch(/constraint|duplicate/);
    expect(errorReason(new Error('boom'))).toBe('boom');
  });
});

describe('emails stay safe with odd input', () => {
  it('welcome email escapes HTML and has sensible fallbacks', () => {
    expect(renderWelcomeEmail({ businessName: '<script>x</script>' }).html).not.toContain('<script>x');
    const noName = renderWelcomeEmail({});
    expect(noName.html).toContain('Your account is ready');
    expect(noName.html).not.toMatch(/undefined|null|\{\{/);
  });
});

describe('settings validation with hostile input', () => {
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    Object.entries({ name: 'Acme', google_review_url: 'https://g.page/x', booking_url: 'https://a.com/b', review_request_window_days: '2', rebooking_reminder_interval_days: '30', ...o }).forEach(([k, v]) => f.set(k, v));
    return f;
  };
  it.each([
    [{ name: 'x'.repeat(500) }],
    [{ review_request_window_days: '1e9' }],
    [{ review_request_window_days: 'abc' }],
    [{ google_review_url: 'https://' + 'a'.repeat(3000) }],
    [{ booking_url: 'ftp://files.example.com' }],
    [{ review_cooldown_enabled: 'on', review_cooldown_days: '99999' }],
  ])('rejects %j', (o) => {
    expect(parseSettingsForm(fd(o)).ok).toBe(false);
  });
});
