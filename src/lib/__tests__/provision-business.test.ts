import { describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_JOURNEYS, provisionBusiness } from '@/lib/provision-business';

type Call = { table: string; op: string; payload?: unknown; opts?: unknown };

/** Minimal chainable stand-in for the Supabase client that records writes. */
function fakeAdmin(opts: { raceLost?: boolean; memberError?: string; journeyError?: string } = {}) {
  const calls: Call[] = [];
  const existing = { id: 'biz-1', owner_id: 'user-1', subscription_status: 'trialing', trial_ends_at: null };
  const client = {
    from(table: string) {
      return {
        upsert(payload: unknown, o: unknown) {
          calls.push({ table, op: 'upsert', payload, opts: o });
          const err = table === 'business_members' ? opts.memberError : table === 'journeys' ? opts.journeyError : undefined;
          const result = { data: table === 'businesses' && !opts.raceLost ? existing : null, error: err ? { message: err } : null };
          return Object.assign(Promise.resolve(result), { select: () => ({ maybeSingle: async () => result }) });
        },
        select() {
          return { eq: () => ({ single: async () => ({ data: existing, error: null }) }) };
        },
      };
    },
  };
  return { client: client as never, calls };
}

describe('provisionBusiness (first login)', () => {
  it('creates the business, the owner membership and all four default journeys', async () => {
    const { client, calls } = fakeAdmin();
    const res = await provisionBusiness(client, 'user-1');
    expect(res.created).toBe(true);
    expect(calls.map((c) => c.table)).toEqual(['businesses', 'business_members', 'journeys']);
    expect(calls[1].payload).toEqual({ business_id: 'biz-1', user_id: 'user-1', role: 'owner' });
    expect((calls[2].payload as { key: string }[]).map((j) => j.key).sort()).toEqual(['birthday', 'rebooking_reminder', 'review_sequence', 'win_back']);
  });

  it('never gives a new business a trial or a subscription (trial is opt-in)', async () => {
    const { client, calls } = fakeAdmin();
    await provisionBusiness(client, 'user-1');
    expect(calls[0].payload).toEqual({ owner_id: 'user-1' });
  });

  it('is idempotent: all inserts ignore duplicates, so a repeat or racing call changes nothing', async () => {
    const { client, calls } = fakeAdmin();
    await provisionBusiness(client, 'user-1');
    for (const c of calls) expect(c.opts).toMatchObject({ ignoreDuplicates: true });
  });

  it('when another request won the race it loads their business and reports created=false', async () => {
    const { client } = fakeAdmin({ raceLost: true });
    const res = await provisionBusiness(client, 'user-1');
    expect(res.created).toBe(false);
    expect(res.business.id).toBe('biz-1');
  });

  it('fails loudly if the membership cannot be created (a business nobody can open is worse than an error)', async () => {
    const { client } = fakeAdmin({ memberError: 'boom' });
    await expect(provisionBusiness(client, 'user-1')).rejects.toThrow(/membership/i);
  });

  it('does not block sign-in if only the default journeys fail (the sender falls back to a single request)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeAdmin({ journeyError: 'boom' });
    await expect(provisionBusiness(client, 'user-1')).resolves.toMatchObject({ created: true });
    spy.mockRestore();
  });

  it('review_sequence keeps the advertised request + day-3 + day-7 shape', () => {
    const seq = DEFAULT_JOURNEYS.find((j) => j.key === 'review_sequence')!;
    expect(seq.steps.map((s) => s.wait_hours)).toEqual([0, 72, 168]);
  });
});
