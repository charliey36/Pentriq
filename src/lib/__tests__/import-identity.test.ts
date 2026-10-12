import { describe, expect, it } from '@jest/globals';
import { normalizePhone } from '@/lib/phone';
import { entityKeyForExisting, resolveImportIdentities, type ExistingContact, type IdentityRow } from '@/lib/import-identity';

describe('normalizePhone', () => {
  it('treats the common ways of writing the same UK mobile as equal', () => {
    const forms = ['07700 900123', '07700900123', '+44 7700 900123', '+44 (0)7700 900123', '0044 7700 900123', '(07700) 900-123', '447700900123'.replace(/^/, '+')];
    expect(new Set(forms.map(normalizePhone)).size).toBe(1);
    expect(normalizePhone('07700 900123')).toBe('447700900123');
  });
  it('keeps non-UK international numbers distinct', () => {
    expect(normalizePhone('+1 415 555 0100')).toBe('14155550100');
    expect(normalizePhone('+1 415 555 0100')).not.toBe(normalizePhone('07700 900123'));
  });
  it('returns null for blanks and placeholders so strangers are never merged on junk', () => {
    for (const junk of [null, undefined, '', '   ', 'n/a', '-', '0', '123', 'TBC', '000000'] as const) {
      expect(normalizePhone(junk as string)).toBeNull();
    }
    expect(normalizePhone('1'.repeat(20))).toBeNull();
  });
});

const existing: ExistingContact[] = [
  { id: 'A', name: 'Alice', email: 'alice@x.com', phone: '07700 900111' },
  { id: 'B', name: 'Bob', email: 'bob@x.com', phone: '+44 7700 900222' },
  { id: 'C', name: 'Cara', email: 'cara@x.com', phone: null },
];
const row = (n: number, email: string, phone: string | null, name = 'Whoever'): IdentityRow => ({ row: n, name, email, phone });
const resolve = (rows: IdentityRow[], ex = existing) => resolveImportIdentities(rows, ex);

describe('resolveImportIdentities', () => {
  it('creates a new customer when neither email nor phone matches', () => {
    const r = resolve([row(1, 'new@x.com', '07700 900999')]);
    expect(r.matchedBy.get(1)).toBe('new');
    expect(r.entities.get(r.rowEntity.get(1)!)!.existingId).toBeNull();
  });

  it('matches an existing customer by email alone', () => {
    const r = resolve([row(1, 'ALICE@x.com', null)]);
    expect(r.rowEntity.get(1)).toBe(entityKeyForExisting('A'));
    expect(r.matchedBy.get(1)).toBe('email');
  });

  it('matches by phone alone, in any format, even when the email is different', () => {
    const r = resolve([row(1, 'different@x.com', '+447700900111')]);
    expect(r.rowEntity.get(1)).toBe(entityKeyForExisting('A'));
    expect(r.matchedBy.get(1)).toBe('phone');
    expect(r.entities.get(entityKeyForExisting('A'))!.email).toBe('alice@x.com'); // existing email is kept
  });

  it('never uses the customer name: same name, different email and phone is a new customer', () => {
    const r = resolve([row(1, 'alice2@x.com', '07700 900888', 'Alice')]);
    expect(r.matchedBy.get(1)).toBe('new');
  });

  it('flags a conflict when the email belongs to one customer and the phone to another, and writes nothing for it', () => {
    const r = resolve([row(1, 'alice@x.com', '07700 900222')]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].row).toBe(1);
    expect(r.conflicts[0].reason).toMatch(/alice@x\.com/);
    expect(r.conflicts[0].reason).toMatch(/bob@x\.com/);
    expect(r.rowEntity.has(1)).toBe(false);
  });

  it('fills a missing phone on an existing customer but never overwrites one they already have', () => {
    const r = resolve([row(1, 'cara@x.com', '07700 900333'), row(2, 'alice@x.com', '07700 900111')]);
    expect(r.entities.get(entityKeyForExisting('C'))!.phoneToFill).toBe('07700 900333');
    expect(r.entities.get(entityKeyForExisting('A'))!.phoneToFill).toBeNull();
    // and a different phone on a customer who has one is simply left alone
    const r2 = resolve([row(1, 'alice@x.com', '07700 900555')]);
    expect(r2.entities.get(entityKeyForExisting('A'))!.phoneToFill).toBeNull();
  });

  it('treats two rows in the same file with the same phone as one new customer', () => {
    const r = resolve([row(1, 'p@x.com', '07700 900777'), row(2, 'q@x.com', '+44 7700 900777')]);
    expect(r.rowEntity.get(2)).toBe(r.rowEntity.get(1));
    expect(r.matchedBy.get(2)).toBe('phone');
  });

  it('treats two rows in the same file with the same email as one new customer', () => {
    const r = resolve([row(1, 'p@x.com', null), row(2, 'P@x.com', '07700 900777')]);
    expect(r.rowEntity.get(2)).toBe(r.rowEntity.get(1));
  });

  it('detects a conflict between two customers that only exist inside the file', () => {
    const r = resolve([row(1, 'p@x.com', '07700 900001'), row(2, 'q@x.com', '07700 900002'), row(3, 'p@x.com', '07700 900002')]);
    expect(r.conflicts.map((c) => c.row)).toEqual([3]);
    expect(r.conflicts[0].reason).toMatch(/earlier row in this file/);
  });

  it('flags a phone shared by several existing customers as a conflict, unless the email picks one', () => {
    const shared: ExistingContact[] = [
      { id: 'X', name: 'Dad', email: 'dad@x.com', phone: '01632 960001' },
      { id: 'Y', name: 'Son', email: 'son@x.com', phone: '01632 960001' },
    ];
    expect(resolve([row(1, 'new@x.com', '01632 960001')], shared).conflicts).toHaveLength(1);
    const picked = resolve([row(1, 'son@x.com', '01632 960001')], shared);
    expect(picked.conflicts).toHaveLength(0);
    expect(picked.rowEntity.get(1)).toBe(entityKeyForExisting('Y'));
  });

  it('does not match on placeholder phone numbers', () => {
    const junkExisting: ExistingContact[] = [{ id: 'J', name: 'Junk', email: 'junk@x.com', phone: 'n/a' }];
    const r = resolve([row(1, 'other@x.com', 'n/a')], junkExisting);
    expect(r.matchedBy.get(1)).toBe('new');
  });
});
