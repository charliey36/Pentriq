/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Compact in-memory Supabase stand-in for the quick-win tests: auto-creates
 * tables and supports select / insert / upsert / update with eq, neq, in, is,
 * not, gte, lt, order, range, limit, single/maybeSingle and head counts.
 */
export type Row = Record<string, any>;

export class MiniDb {
  tables: Record<string, Row[]> = {};
  /** Column defaults the real database would apply on insert. */
  defaults: Record<string, Row> = { journey_enrollments: { status: 'active' }, messages: { status: 'pending' } };
  private n = 0;
  rows(t: string) {
    return (this.tables[t] ??= []);
  }
  nextId(t: string) {
    return `${t}-${++this.n}`;
  }
  from(t: string) {
    return new MiniQuery(this, t);
  }
}

class MiniQuery implements PromiseLike<any> {
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private payload: any;
  private returning = false;
  private head = false;
  private count = false;
  private orderCol: string | null = null;
  private asc = true;
  private rng: [number, number] | null = null;
  private max: number | null = null;
  private isSingle = false;
  private conflict: string[] = [];
  private ignoreDup = false;
  constructor(private db: MiniDb, private t: string) {}

  select(_c?: string, o?: { count?: string; head?: boolean }) {
    if (this.op !== 'select') this.returning = true;
    if (o?.count) this.count = true;
    if (o?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = (o?.onConflict ?? '').split(',').filter(Boolean); this.ignoreDup = Boolean(o?.ignoreDuplicates);
    return this;
  }
  update(p: Row) { this.op = 'update'; this.payload = p; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, op: string, v: unknown) { this.filters.push(op === 'is' && v === null ? (r) => r[c] != null : (r) => r[c] !== v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orderCol = c; this.asc = o?.ascending !== false; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.isSingle = true; return this; }
  single() { this.isSingle = true; return this; }
  private run() {
    const rows = this.db.rows(this.t);
    const hit = () => rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'insert' || this.op === 'upsert') {
      const created: Row[] = [];
      for (const p of this.payload as Row[]) {
        if (this.op === 'upsert' && this.conflict.length) {
          const existing = rows.find((r) => this.conflict.every((c) => r[c] === p[c]));
          if (existing) { if (!this.ignoreDup) Object.assign(existing, p); continue; }
        }
        const row = { id: this.db.nextId(this.t), ...(this.db.defaults[this.t] ?? {}), ...p };
        rows.push(row);
        created.push(row);
      }
      return { data: this.returning ? (this.isSingle ? created[0] ?? null : created) : null, error: null };
    }
    if (this.op === 'update') {
      const m = hit();
      m.forEach((r) => Object.assign(r, this.payload));
      return { data: this.returning ? m : null, error: null };
    }
    let out = hit();
    if (this.orderCol) out = [...out].sort((a, b) => ((a[this.orderCol!] < b[this.orderCol!] ? -1 : 1) * (this.asc ? 1 : -1)));
    if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    if (this.max !== null) out = out.slice(0, this.max);
    const count = this.count ? hit().length : null;
    return { data: this.head ? null : this.isSingle ? out[0] ?? null : out, count, error: null };
  }
  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}
