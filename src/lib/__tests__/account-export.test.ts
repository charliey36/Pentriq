import { describe, expect, it } from '@jest/globals';
import { PAGE_SIZE, buildExport, csvCell, fetchAllRows, toCsv, EXPORT_TABLES } from '@/lib/account-export';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(3)).toBe('3');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });
  it('writes a header and one line per row', () => {
    expect(toCsv([{ name: 'Jo', email: 'jo@x.com' }], ['name', 'email'])).toBe('name,email\r\nJo,jo@x.com\r\n');
  });
});

describe('export paging', () => {
  it('reads past the 1000-row response cap', async () => {
    const total = PAGE_SIZE * 2 + 5;
    const pages: number[] = [];
    const { rows, error } = await fetchAllRows(async (_t, from, to) => {
      pages.push(from);
      return { data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => ({ n: from + i })), error: null };
    }, 'customers');
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(total);
    expect(pages).toEqual([0, PAGE_SIZE, PAGE_SIZE * 2]);
  });

  it('stops and reports an error rather than returning a silently partial table', async () => {
    const { error } = await fetchAllRows(async () => ({ data: null, error: { message: 'boom' } }), 'customers');
    expect(error).toBe('boom');
  });

  it('never exports secrets, and records unreadable tables as warnings', async () => {
    expect(EXPORT_TABLES).not.toContain('google_business_connections' as never);
    expect(EXPORT_TABLES).not.toContain('api_keys' as never);
    const out = await buildExport({ id: 'b1' }, async (t) => (t === 'visits' ? { data: null, error: { message: 'missing' } } : { data: [], error: null }));
    expect(out.warnings).toEqual(['visits: missing']);
    expect(Object.keys(out.tables)).toHaveLength(EXPORT_TABLES.length);
  });
});
