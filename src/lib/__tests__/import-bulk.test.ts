import { describe, expect, it } from '@jest/globals';
import { bulkImportCustomers, type BulkImportRow } from '@/lib/customers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** Small in-memory Supabase stand-in with the semantics bulkImportCustomers relies on. */
class FakeDb {
  tables: Record<string, Row[]> = { customers: [], visits: [], services: [], messages: [], journeys: [], journey_enrollments: [] };
  private n = 0;
  nextId(t: string) {
    return `${t}-${++this.n}`;
  }
  from(t: string) {
    return new Q(this, t);
  }
}
class Q implements PromiseLike<any> {
  private op: 'select' | 'insert' | 'update' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private payload: any;
  private returning = false;
  private orderCol: string | null = null;
  private rng: [number, number] | null = null;
  private single = false;
  constructor(private db: FakeDb, private t: string) {}
  select() {
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(p: Row) {
    this.op = 'update';
    this.payload = p;
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  not(c: string, op: string, v: unknown) {
    this.filters.push(op === 'is' && v === null ? (r) => r[c] !== null && r[c] !== undefined : (r) => r[c] !== v);
    return this;
  }
  order(c: string) {
    this.orderCol = c;
    return this;
  }
  range(a: number, b: number) {
    this.rng = [a, b];
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  private run() {
    const rows = this.db.tables[this.t];
    const hit = () => rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'insert') {
      const created = (this.payload as Row[]).map((p) => ({ id: this.db.nextId(this.t), ...p }));
      rows.push(...created);
      return { data: this.returning ? created : null, error: null };
    }
    if (this.op === 'update') {
      const m = hit();
      m.forEach((r) => Object.assign(r, this.payload));
      return { data: this.returning ? m : null, error: null };
    }
    let out = hit();
    if (this.orderCol) out = [...out].sort((a, b) => (a[this.orderCol!] < b[this.orderCol!] ? -1 : 1));
    if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    return { data: this.single ? out[0] ?? null : out, error: null };
  }
  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

const BIZ = { id: 'biz-1', delay_hours: 2, review_request_window_days: 14 };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const csv = (name: string, email: string, phone: string | null, date: string, amount: string | null = '100', service = 'Haircut'): BulkImportRow => ({
  name, email, phone, date, amountSpent: amount, service,
});

function seed() {
  const db = new FakeDb();
  db.tables.services.push({ id: 'svc-haircut', business_id: BIZ.id, name: 'Haircut' });
  db.tables.customers.push(
    { id: 'cust-alice', business_id: BIZ.id, name: 'Alice', email: 'alice@x.com', phone: '07700 900111', total_spend: 250, visit_count: 2, last_service_date: daysAgo(40), unsubscribed_at: null },
    { id: 'cust-bob', business_id: BIZ.id, name: 'Bob', email: 'bob@x.com', phone: '+44 7700 900222', total_spend: 80, visit_count: 1, last_service_date: daysAgo(60), unsubscribed_at: null },
    { id: 'cust-cara', business_id: BIZ.id, name: 'Cara', email: 'cara@x.com', phone: null, total_spend: 0, visit_count: 0, last_service_date: null, unsubscribed_at: null }
  );
  // Alice's history before this import: two earlier visits that must survive untouched.
  db.tables.visits.push(
    { id: 'v-old-1', business_id: BIZ.id, customer_id: 'cust-alice', service_id: 'svc-haircut', visited_at: `${daysAgo(100)}T12:00:00Z`, price: 150 },
    { id: 'v-old-2', business_id: BIZ.id, customer_id: 'cust-alice', service_id: 'svc-haircut', visited_at: `${daysAgo(40)}T12:00:00Z`, price: 100 }
  );
  return db;
}
const run = (db: FakeDb, rows: BulkImportRow[], autoSend = false) => bulkImportCustomers(db as never, BIZ, rows, autoSend, '2026-10-12T00:00:00Z');
const customer = (db: FakeDb, id: string) => db.tables.customers.find((c) => c.id === id)!;

describe('bulkImportCustomers — email OR phone identity', () => {
  it('creates a new customer and a service record when nothing matches', async () => {
    const db = seed();
    const s = await run(db, [csv('Dan', 'dan@x.com', '07700 900444', daysAgo(1), '60')]);
    expect(s).toMatchObject({ customersCreated: 1, customersUpdated: 0, serviceRecordsAdded: 1, conflicts: 0 });
    const dan = db.tables.customers.find((c) => c.email === 'dan@x.com')!;
    expect(dan).toMatchObject({ visit_count: 1, total_spend: 60, last_service_date: daysAgo(1), consent_confirmed_at: '2026-10-12T00:00:00Z' });
    expect(db.tables.visits.filter((v) => v.customer_id === dan.id)).toHaveLength(1);
  });

  it('updates an existing customer matched by EMAIL: counts up, spend up, last service date moves, history kept', async () => {
    const db = seed();
    const s = await run(db, [csv('Alice Smith', 'ALICE@x.com', null, daysAgo(2), '75', 'Colour')]);
    expect(s).toMatchObject({ customersCreated: 0, customersUpdated: 1, serviceRecordsAdded: 1, conflicts: 0 });
    expect(customer(db, 'cust-alice')).toMatchObject({ visit_count: 3, total_spend: 325, last_service_date: daysAgo(2) });
    expect(db.tables.visits.filter((v) => v.customer_id === 'cust-alice')).toHaveLength(3); // 2 old + 1 new
    expect(db.tables.visits.find((v) => v.id === 'v-old-1')).toMatchObject({ price: 150 }); // untouched
    expect(db.tables.customers.filter((c) => c.email.startsWith('alice'))).toHaveLength(1); // not duplicated
  });

  it('updates an existing customer matched by PHONE alone, in a different format, and keeps their email and name', async () => {
    const db = seed();
    const s = await run(db, [csv('Totally Different Name', 'new-address@x.com', '+44 (0)7700 900111', daysAgo(1), '40')]);
    expect(s).toMatchObject({ customersCreated: 0, customersUpdated: 1, serviceRecordsAdded: 1 });
    expect(customer(db, 'cust-alice')).toMatchObject({ name: 'Alice', email: 'alice@x.com', visit_count: 3, total_spend: 290 });
    expect(db.tables.customers).toHaveLength(3);
    const row = s.results.find((r) => r.status === 'updated')!;
    expect(row).toMatchObject({ status: 'updated', matchedBy: 'phone' });
    expect((row as { note?: string }).note).toMatch(/alice@x\.com/);
  });

  it('never matches on name: same name, new email and phone is a separate customer', async () => {
    const db = seed();
    const s = await run(db, [csv('Alice', 'alice.other@x.com', '07700 900999', daysAgo(1))]);
    expect(s).toMatchObject({ customersCreated: 1, customersUpdated: 0 });
    expect(customer(db, 'cust-alice')).toMatchObject({ visit_count: 2, total_spend: 250 });
  });

  it('flags a CONFLICT (email → Alice, phone → Bob), writes nothing for it, and does not merge', async () => {
    const db = seed();
    const before = JSON.stringify([customer(db, 'cust-alice'), customer(db, 'cust-bob')]);
    const visitsBefore = db.tables.visits.length;
    const s = await run(db, [csv('Alice', 'alice@x.com', '07700 900222', daysAgo(1), '99')]);
    expect(s).toMatchObject({ customersCreated: 0, customersUpdated: 0, serviceRecordsAdded: 0, conflicts: 1 });
    expect(JSON.stringify([customer(db, 'cust-alice'), customer(db, 'cust-bob')])).toBe(before);
    expect(db.tables.visits).toHaveLength(visitsBefore);
    expect(db.tables.customers).toHaveLength(3);
    const c = s.results.find((r) => r.status === 'conflict') as { reason: string };
    expect(c.reason).toMatch(/alice@x\.com/);
    expect(c.reason).toMatch(/bob@x\.com/);
  });

  it('a conflict row does not stop the other rows in the same file from importing', async () => {
    const db = seed();
    const s = await run(db, [
      csv('Alice', 'alice@x.com', '07700 900222', daysAgo(1)), // conflict
      csv('Eve', 'eve@x.com', null, daysAgo(1)), // new
      csv('Bob', 'bob@x.com', null, daysAgo(3)), // update
    ]);
    expect(s).toMatchObject({ customersCreated: 1, customersUpdated: 1, serviceRecordsAdded: 2, conflicts: 1 });
  });

  it('is safe to upload the same file twice: the repeat adds nothing and changes no totals', async () => {
    const db = seed();
    const file = [csv('Alice', 'alice@x.com', null, daysAgo(2), '75', 'Colour'), csv('Dan', 'dan@x.com', '07700 900444', daysAgo(1))];
    await run(db, file);
    const snapshot = JSON.stringify(db.tables.customers);
    const visits = db.tables.visits.length;
    const again = await run(db, file);
    expect(again).toMatchObject({ customersCreated: 0, customersUpdated: 0, serviceRecordsAdded: 0, duplicates: 2 });
    expect(JSON.stringify(db.tables.customers)).toBe(snapshot);
    expect(db.tables.visits).toHaveLength(visits);
  });

  it('treats two rows in one file sharing a phone as ONE new customer with two service records', async () => {
    const db = seed();
    const s = await run(db, [csv('Fay', 'fay@x.com', '07700 900555', daysAgo(5), '30'), csv('Fay B', 'fay.work@x.com', '+447700900555', daysAgo(1), '20', 'Colour')]);
    expect(s).toMatchObject({ customersCreated: 1, customersUpdated: 0, serviceRecordsAdded: 2 });
    const fay = db.tables.customers.filter((c) => c.phone?.includes('900555') || c.phone?.includes('9005'));
    expect(fay).toHaveLength(1);
    expect(fay[0]).toMatchObject({ visit_count: 2, total_spend: 50, last_service_date: daysAgo(1) });
  });

  it('fills a blank phone on an existing customer but does not overwrite an existing one', async () => {
    const db = seed();
    await run(db, [csv('Cara', 'cara@x.com', '07700 900333', daysAgo(1)), csv('Alice', 'alice@x.com', '07700 900888', daysAgo(2), '10', 'Colour')]);
    expect(customer(db, 'cust-cara').phone).toBe('07700 900333');
    expect(customer(db, 'cust-alice').phone).toBe('07700 900111');
  });

  it('does not move last_service_date backwards when an older service is imported', async () => {
    const db = seed();
    await run(db, [csv('Bob', 'bob@x.com', null, daysAgo(200))]);
    expect(customer(db, 'cust-bob').last_service_date).toBe(daysAgo(60));
    expect(customer(db, 'cust-bob').visit_count).toBe(2);
  });

  it('queues a review request for an updated customer whose latest service is recent, but not for an unsubscribed one', async () => {
    const db = seed();
    customer(db, 'cust-bob').unsubscribed_at = '2026-01-01T00:00:00Z';
    const s = await run(db, [csv('Alice', 'alice@x.com', null, daysAgo(1), '10', 'Colour'), csv('Bob', 'bob@x.com', null, daysAgo(1), '10', 'Colour')]);
    expect(s.queued).toBe(1);
    expect(db.tables.messages.map((m) => m.customer_id)).toEqual(['cust-alice']);
  });

  it('reports bad rows without blocking good ones', async () => {
    const db = seed();
    const s = await run(db, [csv('', 'x@x.com', null, daysAgo(1)), csv('Gus', 'not-an-email', null, daysAgo(1)), csv('Hal', 'hal@x.com', null, daysAgo(1))]);
    expect(s).toMatchObject({ errors: 2, customersCreated: 1, serviceRecordsAdded: 1 });
  });
});

describe('bulkImportCustomers — a plain customer list with no service dates', () => {
  const plain = (name: string, email: string, phone: string | null = null): BulkImportRow => ({ name, email, phone, date: '', amountSpent: null, service: 'General Service' });

  it('works on an account with no customers at all: adds them, records no services, queues no review requests', async () => {
    const db = new FakeDb();
    const s = await run(db, [plain('Ann', 'ann@x.com', '07700 900001'), plain('Ben', 'ben@x.com')], true);
    expect(s).toMatchObject({ customersCreated: 2, customersUpdated: 0, serviceRecordsAdded: 0, conflicts: 0, queued: 0, errors: 0 });
    expect(db.tables.customers).toHaveLength(2);
    expect(db.tables.customers[0]).toMatchObject({ visit_count: 0, total_spend: 0, last_service_date: null, consent_confirmed_at: '2026-10-12T00:00:00Z' });
    expect(db.tables.visits).toHaveLength(0);
    expect(db.tables.messages).toHaveLength(0); // even with auto-send on: nobody is emailed from a bare list
    expect(db.tables.services).toHaveLength(0); // and no stray "General Service" is created
  });

  it('recognises existing customers without changing their history or totals', async () => {
    const db = seed();
    const before = JSON.stringify(db.tables.customers);
    // Row 1 matches Alice by email; row 2 has a different email but Bob's phone, so it matches Bob. Neither is new.
    const s = await run(db, [plain('Alice', 'alice@x.com'), plain('Whoever', 'x@x.com', '07700 900222')]);
    expect(s).toMatchObject({ customersCreated: 0, customersUpdated: 0, customersUnchanged: 2, serviceRecordsAdded: 0 });
    expect(JSON.stringify(db.tables.customers.filter((c) => c.id.startsWith('cust-')))).toBe(before);
    expect(db.tables.visits).toHaveLength(2); // only the two seeded visits
  });

  it('still flags a conflict on a bare list', async () => {
    const db = seed();
    const s = await run(db, [plain('Alice', 'alice@x.com', '07700 900222')]);
    expect(s).toMatchObject({ conflicts: 1, customersCreated: 0, customersUnchanged: 0 });
  });

  it('a later dated import fills in the history for customers first added from a bare list', async () => {
    const db = new FakeDb();
    await run(db, [plain('Ann', 'ann@x.com')]);
    const s = await run(db, [csv('Ann', 'ann@x.com', null, daysAgo(2), '55')]);
    expect(s).toMatchObject({ customersCreated: 0, customersUpdated: 1, serviceRecordsAdded: 1 });
    expect(db.tables.customers[0]).toMatchObject({ visit_count: 1, total_spend: 55, last_service_date: daysAgo(2) });
  });

  it('a mixed file works: dated rows record services, dateless rows only add customers', async () => {
    const db = new FakeDb();
    const s = await run(db, [csv('Cy', 'cy@x.com', null, daysAgo(1), '20'), plain('Di', 'di@x.com')]);
    expect(s).toMatchObject({ customersCreated: 2, serviceRecordsAdded: 1 });
    expect(db.tables.customers.find((c) => c.email === 'di@x.com')).toMatchObject({ visit_count: 0 });
  });
});
