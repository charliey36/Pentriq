/**
 * In-memory Supabase stand-in for the Google review sync + reply tests: select / upsert
 * (onConflict, ignoreDuplicates) / update / delete with eq, in, lte, not, order, range, limit, maybeSingle.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

/** In-memory Supabase stand-in covering the calls the sync engine makes. */
export class FakeAdmin {
  tables: Record<string, Row[]> = {};
  auth = { admin: { getUserById: async () => ({ data: { user: { email: 'owner@example.com' } } }) } };

  rows(t: string) {
    return (this.tables[t] ??= []);
  }
  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements PromiseLike<any> {
  private mode: 'select' | 'upsert' | 'update' | 'delete' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private payload: any;
  private opts: any = {};
  private orderCol: string | null = null;
  private asc = true;
  private lim: number | null = null;
  private rangeArgs: [number, number] | null = null;
  private single: 'maybe' | 'one' | null = null;
  private returning = false;

  constructor(private db: FakeAdmin, private table: string) {}

  select() {
    if (this.mode !== 'select') this.returning = true;
    return this;
  }
  upsert(rows: Row | Row[], opts: any) {
    this.mode = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.opts = opts;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = 'insert' as any;
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.mode = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.mode = 'delete';
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
  lte(c: string, v: any) {
    this.filters.push((r) => r[c] <= v);
    return this;
  }
  not(c: string, _op: string, v: unknown) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.orderCol = c;
    this.asc = o?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(a: number, b: number) {
    this.rangeArgs = [a, b];
    return this;
  }
  maybeSingle() {
    this.single = 'maybe';
    return this;
  }
  single_() {
    return this;
  }

  private run() {
    const rows = this.db.rows(this.table);
    const matches = () => rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.mode === 'upsert') {
      const keys: string[] = String(this.opts.onConflict).split(',');
      const out: Row[] = [];
      for (const incoming of this.payload as Row[]) {
        const existing = rows.find((r) => keys.every((k) => r[k] === incoming[k]));
        if (existing) {
          if (!this.opts.ignoreDuplicates) Object.assign(existing, incoming);
        } else {
          const row = { id: `${this.table}-${rows.length + 1}`, ...incoming };
          rows.push(row);
          out.push(row);
        }
      }
      return { data: this.returning ? out : null, error: null };
    }
    if ((this.mode as string) === 'insert') {
      for (const r of this.payload as Row[]) this.db.rows(this.table).push({ id: `${this.table}-${this.db.rows(this.table).length + 1}`, ...r });
      return { data: null, error: null };
    }
    if (this.mode === 'update') {
      const hit = matches();
      hit.forEach((r) => Object.assign(r, this.payload));
      return { data: this.returning ? hit : null, error: null };
    }
    if (this.mode === 'delete') {
      const hit = new Set(matches());
      this.db.tables[this.table] = rows.filter((r) => !hit.has(r));
      return { data: null, error: null };
    }

    let result = matches();
    if (this.orderCol) {
      const c = this.orderCol;
      result = [...result].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (this.asc ? 1 : -1));
    }
    if (this.rangeArgs) result = result.slice(this.rangeArgs[0], this.rangeArgs[1] + 1);
    if (this.lim !== null) result = result.slice(0, this.lim);
    if (this.single) return { data: result[0] ?? null, error: null };
    return { data: result, error: null };
  }

  then<T1, T2>(ok?: ((v: any) => T1 | PromiseLike<T1>) | null, bad?: ((e: any) => T2 | PromiseLike<T2>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}
