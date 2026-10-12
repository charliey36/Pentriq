import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const db: { entries: Row[]; digests: Row[]; failPublish: boolean } = { entries: [], digests: [], failPublish: false };

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const rows = () => (table === 'changelog_entries' ? db.entries : db.digests);
      let filter: (r: Row) => boolean = () => true;
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: any;
      const q: any = {
        select: () => q,
        order: () => q,
        eq: (c: string, v: unknown) => ((filter = (r) => r[c] === v), q),
        in: (c: string, vs: unknown[]) => ((filter = (r) => vs.includes(r[c])), q),
        insert: (p: Row) => ((op = 'insert'), (payload = p), q),
        update: (p: Row) => ((op = 'update'), (payload = p), q),
        delete: () => ((op = 'delete'), q),
        then: (ok: any, bad: any) =>
          Promise.resolve(
            (() => {
              if (op === 'insert') {
                if (rows().some((r) => r.week_of === payload.week_of)) return { data: null, error: { code: '23505', message: 'duplicate' } };
                rows().push({ ...payload });
                return { data: null, error: null };
              }
              if (op === 'update') {
                if (db.failPublish) return { data: null, error: { message: 'boom' } };
                rows().filter(filter).forEach((r) => Object.assign(r, payload));
                return { data: null, error: null };
              }
              if (op === 'delete') {
                const keep = rows().filter((r) => !filter(r));
                rows().splice(0, rows().length, ...keep);
                return { data: null, error: null };
              }
              return { data: rows().filter(filter), error: null };
            })()
          ).then(ok, bad),
      };
      return q;
    },
  }),
}));

import { GET } from '@/app/api/publish-weekly-digest/route';

const call = (auth = 'Bearer s3cret') => GET({ headers: { get: (n: string) => (n === 'authorization' ? auth : null) }, nextUrl: { searchParams: new URLSearchParams() } } as never);
const entry = (id: string, title: string, tag: string, published = false): Row => ({ id, title, tag, published, entry_date: '2026-10-12' });

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  db.entries = [];
  db.digests = [];
  db.failPublish = false;
});

describe('weekly digest route', () => {
  it('rejects callers without the cron secret and changes nothing', async () => {
    db.entries = [entry('1', 'Stripe billing', 'New')];
    expect((await call('Bearer wrong')).status).toBe(401);
    expect(db.entries[0].published).toBe(false);
    expect(db.digests).toHaveLength(0);
  });

  it('turns ALL unpublished entries into one saved digest and marks them published (already-published ones are left alone)', async () => {
    db.entries = [entry('1', 'Stripe billing', 'New'), entry('2', 'customer import reliability', 'Improved'), entry('3', 'Old thing', 'New', true)];
    const body = await (await call()).json();
    expect(body.published).toBe(2);
    expect(body.summary).toBe('This week we introduced Stripe billing, and improved customer import reliability.');
    expect(db.digests).toHaveLength(1);
    expect(db.digests[0].summary).toBe(body.summary);
    expect(db.entries.filter((e) => e.published).map((e) => e.id).sort()).toEqual(['1', '2', '3']);
    expect(db.entries.find((e) => e.id === '1')).toMatchObject({ published: true, digest_week: body.weekOf });
    expect(db.entries.find((e) => e.id === '3')?.digest_week).toBeUndefined(); // untouched
  });

  it('does nothing and saves no empty digest when there is nothing unpublished', async () => {
    db.entries = [entry('1', 'Old', 'New', true)];
    const body = await (await call()).json();
    expect(body.published).toBe(0);
    expect(db.digests).toHaveLength(0);
  });

  it('a second run the same week publishes nothing new and never duplicates the digest', async () => {
    db.entries = [entry('1', 'Stripe billing', 'New')];
    await call();
    db.entries.push(entry('2', 'Late addition', 'New'));
    const second = await (await call()).json();
    expect(second.published).toBe(0);
    expect(db.digests).toHaveLength(1);
    expect(db.entries.find((e) => e.id === '2')?.published).toBe(false); // waits for next Monday
  });

  it('rolls the digest back if publishing fails, so the next run can retry cleanly', async () => {
    db.entries = [entry('1', 'Stripe billing', 'New')];
    db.failPublish = true;
    expect((await call()).status).toBe(500);
    expect(db.digests).toHaveLength(0);
    expect(db.entries[0].published).toBe(false);
    db.failPublish = false;
    expect((await (await call()).json()).published).toBe(1);
  });
});
