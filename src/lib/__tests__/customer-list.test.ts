import { csvCell } from '@/lib/account-export';
import {
  actionableIds, applyList, cleanMessageIds, countByFilter, DEFAULT_STATE, matchesQuery,
  parseListState, rowsToCsv, serializeListState, sortRows, type ListRow,
} from '@/lib/customer-list';

const row = (o: Partial<ListRow>): ListRow => ({
  id: 'id', name: 'N', email: 'n@x.co', addedLabel: '01/01/2026', addedAt: '2026-01-01T00:00:00Z',
  status: null, requestLabel: null, messageId: null, ...o,
});

describe('customer list filtering and sorting', () => {
  const rows = [
    row({ id: 'a', name: 'Ann Smith', email: 'ann@gmail.com', addedAt: '2026-03-01', status: 'sent' }),
    row({ id: 'b', name: 'bob jones', email: 'bob@work.co.uk', addedAt: '2026-01-01', status: 'held', messageId: 'm1' }),
    row({ id: 'c', name: 'Cara Smith', email: 'cara@gmail.com', addedAt: '2026-02-01', status: null }),
    row({ id: 'd', name: 'Dan', email: 'dan@x.co', addedAt: '2026-02-01', status: 'failed' }),
  ];

  it('matches every term across name and email, case-insensitively', () => {
    expect(matchesQuery(rows[0], 'ann smith')).toBe(true);
    expect(matchesQuery(rows[0], 'smith gmail')).toBe(true);
    expect(matchesQuery(rows[0], 'smith work')).toBe(false);
    expect(matchesQuery(rows[0], '   ')).toBe(true);
  });

  it('filters by status including "none"', () => {
    expect(applyList(rows, { ...DEFAULT_STATE, filter: 'none' }).map((r) => r.id)).toEqual(['c']);
    expect(applyList(rows, { ...DEFAULT_STATE, filter: 'held' }).map((r) => r.id)).toEqual(['b']);
  });

  it('sorts by date descending by default and breaks ties by id for stability', () => {
    expect(applyList(rows, DEFAULT_STATE).map((r) => r.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('sorts names ignoring case, and by status with failures first', () => {
    expect(sortRows(rows, 'name', 'asc').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(sortRows(rows, 'status', 'asc').map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('does not mutate its input', () => {
    const copy = [...rows];
    sortRows(rows, 'name', 'desc');
    expect(rows).toEqual(copy);
  });

  it('counts per filter', () => {
    expect(countByFilter(rows)).toEqual({ all: 4, held: 1, pending: 0, sent: 1, failed: 1, none: 1 });
  });
});

describe('URL state', () => {
  it('round-trips and omits defaults', () => {
    expect(serializeListState(DEFAULT_STATE)).toBe('');
    const s = { query: 'smith', filter: 'failed' as const, sort: 'name' as const, dir: 'asc' as const };
    expect(parseListState(new URLSearchParams(serializeListState(s)))).toEqual(s);
  });

  it('ignores junk values from a hand-edited URL', () => {
    const s = parseListState(new URLSearchParams('status=drop&sort=%3Cscript%3E&dir=sideways&q=' + 'x'.repeat(500)));
    expect(s.filter).toBe('all');
    expect(s.sort).toBe('added');
    expect(s.dir).toBe('desc');
    expect(s.query.length).toBe(100);
  });
});

describe('CSV export', () => {
  it('neutralises spreadsheet formula injection', () => {
    for (const evil of ['=HYPERLINK("http://evil")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd']) {
      expect(csvCell(evil).replace(/^"/, '').startsWith("'")).toBe(true);
    }
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Smith, Ann')).toBe('"Smith, Ann"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(null)).toBe('');
  });

  it('writes a header and CRLF rows', () => {
    const csv = rowsToCsv([row({ name: '=EVIL()', email: 'a@b.co', status: 'sent', requestLabel: 'Sent 01/01' })]);
    expect(csv.split('\r\n')[0]).toBe('Name,Email,Added,Review request status,Review request detail');
    expect(csv.split('\r\n')[1].startsWith("'=EVIL()")).toBe(true);
  });
});

describe('bulk selection', () => {
  const all = [
    row({ id: 'a', status: 'held', messageId: 'm1' }),
    row({ id: 'b', status: 'sent', messageId: null }),
    row({ id: 'c', status: 'pending', messageId: 'm3' }),
    row({ id: 'd', status: 'failed', messageId: 'm4' }),
  ];
  it('only scheduled or held requests are actionable', () => {
    expect(actionableIds(all, new Set(['a', 'b', 'c', 'd']))).toEqual(['m1', 'm3']);
    expect(actionableIds(all, new Set())).toEqual([]);
  });

  it('server-side id sanitiser keeps only unique UUIDs and caps the batch', () => {
    const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    expect(cleanMessageIds('nope')).toEqual([]);
    expect(cleanMessageIds([u(1), u(1), 'x', 5, "1'; drop table"])).toEqual([u(1)]);
    expect(cleanMessageIds(Array.from({ length: 80 }, (_, i) => u(i))).length).toBe(25);
  });
});
