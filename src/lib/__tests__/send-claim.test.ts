/** @jest-environment node */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/**
 * In-memory stand-in for PostgREST with the filters the cron senders use. Each statement is applied in one step,
 * as PostgreSQL applies one UPDATE, so interleaved runs behave like concurrent connections.
 */
const db: Record<string, Row[]> = {};
const hooks: { beforeClaim?: (table: string) => void; failMarkSent?: boolean } = {};

function matchOr(row: Row, expr: string): boolean {
  return expr.split(',').some((part) => {
    const [col, op, ...rest] = part.split('.');
    const value = rest.join('.');
    if (op === 'is' && value === 'null') return row[col] === null || row[col] === undefined;
    if (op === 'lte') return row[col] !== null && row[col] !== undefined && row[col] <= value;
    throw new Error(`unsupported or-filter ${part}`);
  });
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'update' = 'select';
  let payload: Row = {};
  let returning = false;
  let single = false;
  let order: { col: string; asc: boolean } | null = null;
  let limit = Infinity;
  const q: any = {
    select: () => ((returning = op === 'update'), q),
    update: (p: Row) => ((op = 'update'), (payload = p), q),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
    lte: (c: string, v: string) => (filters.push((r) => r[c] <= v), q),
    or: (expr: string) => (filters.push((r) => matchOr(r, expr)), q),
    order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), q),
    limit: (n: number) => ((limit = n), q),
    single: () => ((single = true), q),
    maybeSingle: () => ((single = true), q),
    then: (ok: any, bad: any) =>
      Promise.resolve().then(() => {
        const rows = (db[table] ??= []);
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') {
          const isClaim = 'next_attempt_at' in payload && returning;
          if (isClaim) hooks.beforeClaim?.(table);
          const target = isClaim ? rows.filter((r) => filters.every((f) => f(r))) : hit;
          if (hooks.failMarkSent && payload.status === 'sent') return { data: null, error: { message: 'connection reset' } };
          target.forEach((r) => Object.assign(r, payload));
          return { data: returning ? target.map((r) => ({ id: r.id })) : null, error: null };
        }
        let out = [...hit];
        if (order) out.sort((a, b) => (a[order!.col] < b[order!.col] ? -1 : 1) * (order!.asc ? 1 : -1));
        out = out.slice(0, limit).map((r) => ({ ...r }));
        if (single) return { data: out[0] ?? null, error: out[0] ? null : { message: 'not found' } };
        return { data: out, error: null };
      }).then(ok, bad),
  };
  return q;
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => query(t),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'owner@salon.example' } } }) } },
  }),
}));

const sent: Array<{ id: string; key?: string }> = [];
const clock = { advanceAfterSendMs: 0 };

jest.mock('@/lib/messaging', () => {
  const actual = jest.requireActual('@/lib/messaging') as object;
  return {
    ...actual,
    sendMessage: jest.fn(async (params: { idempotencyKey?: string; text: string }) => {
      sent.push({ id: /msg-[\w-]+/.exec(params.text)?.[0] ?? '?', key: params.idempotencyKey });
      if (clock.advanceAfterSendMs) jest.setSystemTime(Date.now() + clock.advanceAfterSendMs);
    }),
  };
});
jest.mock('@/lib/email', () => ({
  sendReviewRequestEmail: jest.fn(async (params: { idempotencyKey?: string; customerName: string }) => {
    sent.push({ id: params.customerName, key: params.idempotencyKey });
  }),
}));
jest.mock('@/lib/templates', () => ({
  // The message id travels in the body so the test can see which row each send was for.
  renderMessage: (_purpose: string, _channel: string, ctx: { privateFeedbackUrl: string }) => ({
    subject: 'Thanks',
    html: '<p>Thanks</p>',
    text: `Thanks ${/feedback\/(msg-[\w-]+)/.exec(ctx.privateFeedbackUrl)?.[1]}`,
  }),
}));
const advanceJourneyEnrollment = jest.fn(async () => undefined);
jest.mock('@/lib/journeys', () => ({ advanceJourneyEnrollment: (...a: unknown[]) => advanceJourneyEnrollment(...(a as [])) }));
jest.mock('@/lib/billing', () => ({ sendBlockedReason: () => null }));
jest.mock('@/lib/send-guards', () => ({ reviewLinkBlockedReason: () => null, REVIEW_LINK_RETRY_MS: 3_600_000 }));
jest.mock('@/lib/review-personalisation', () => ({ loadPersonalisation: async () => ({}), reminderDisabled: () => false }));
jest.mock('@/lib/notifications', () => ({ notifyOwner: async () => undefined }));
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));

import { claimDue, dueFilter, releaseClaims, runBudget, sendIdempotencyKey, CLAIM_LEASE_MS, SEND_BATCH_SIZE } from '@/lib/send-claim';
import { GET as sendMessages } from '@/app/api/send-messages/route';
import { GET as sendReviewRequests } from '@/app/api/send-review-requests/route';
import { createAdminClient } from '@/lib/supabase/admin';

const NOW = new Date('2026-11-03T09:00:00.000Z');
const request = { headers: { get: (n: string) => (n === 'authorization' ? 'Bearer s3cret' : null) }, nextUrl: { searchParams: new URLSearchParams() } } as never;
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function message(n: number, extra: Row = {}): Row {
  return {
    id: `msg-${String(n).padStart(3, '0')}`, business_id: 'biz-1', customer_id: 'cust-1', purpose: 'review_request', channel: 'email',
    status: 'pending', send_at: minutesAgo(1000 - n), next_attempt_at: null, attempts: 0, max_attempts: 5, journey_enrollment_id: null,
    tracking_token: `tok-${n}`, ...extra,
  };
}
const seedCore = () => {
  db.customers = [{ id: 'cust-1', name: 'Sam', email: 'sam@client.example', phone: null, unsubscribed_at: null, unsubscribed_sms_at: null }];
  db.businesses = [{ id: 'biz-1', owner_id: 'owner-1', name: 'Salon', contact_email: 'hi@salon.example', google_review_url: 'https://g.page/r/x', booking_url: null }];
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  process.env.CRON_SECRET = 's3cret';
  for (const k of Object.keys(db)) delete db[k];
  sent.length = 0;
  clock.advanceAfterSendMs = 0;
  hooks.beforeClaim = undefined;
  hooks.failMarkSent = false;
  advanceJourneyEnrollment.mockReset();
  seedCore();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('claim helpers', () => {
  it('builds the due filter, per-attempt idempotency keys and a run budget', () => {
    expect(dueFilter('2026-11-03T09:00:00.000Z')).toBe('next_attempt_at.is.null,next_attempt_at.lte.2026-11-03T09:00:00.000Z');
    expect(sendIdempotencyKey('messages', 'abc', 0)).toBe('pentriq/messages/abc/0');
    expect(sendIdempotencyKey('messages', 'abc', 1)).not.toBe(sendIdempotencyKey('messages', 'abc', 0));
    let t = 1000;
    const b = runBudget(500, () => t);
    expect(b.outOfTime()).toBe(false);
    t = 1500;
    expect(b.outOfTime()).toBe(true);
  });

  it('claims a row once: a second claim of the same row gets nothing, and a released row is due again', async () => {
    db.messages = [message(1)];
    const admin = createAdminClient();
    const first = await claimDue(admin, 'messages', ['msg-001'], NOW);
    expect([...first.ids]).toEqual(['msg-001']);
    expect(db.messages[0].next_attempt_at).toBe(new Date(NOW.getTime() + CLAIM_LEASE_MS).toISOString());
    const second = await claimDue(admin, 'messages', ['msg-001'], NOW);
    expect(second.ids.size).toBe(0);

    expect(await releaseClaims(admin, 'messages', ['msg-001'], first.leaseUntil, NOW.toISOString())).toBeNull();
    expect([...(await claimDue(admin, 'messages', ['msg-001'], NOW)).ids]).toEqual(['msg-001']);
  });

  it('never claims rows that are not pending, not yet due, or waiting for a retry', async () => {
    db.messages = [
      message(1, { status: 'sent' }),
      message(2, { send_at: new Date(NOW.getTime() + 60_000).toISOString() }),
      message(3, { next_attempt_at: new Date(NOW.getTime() + 60_000).toISOString() }),
      message(4, { next_attempt_at: minutesAgo(5) }),
    ];
    const claim = await claimDue(createAdminClient(), 'messages', db.messages.map((m) => m.id), NOW);
    expect([...claim.ids]).toEqual(['msg-004']);
  });
});

describe('/api/send-messages', () => {
  it('sends every due message once, oldest first, with an idempotency key, and marks it sent', async () => {
    db.messages = [message(3), message(1), message(2)];
    const body = await (await sendMessages(request)).json();
    expect(body).toMatchObject({ sent: 3, failed: 0, retried: 0 });
    expect(sent.map((s) => s.id)).toEqual(['msg-001', 'msg-002', 'msg-003']);
    expect(sent[0].key).toBe('pentriq/messages/msg-001/0');
    expect(db.messages.every((m) => m.status === 'sent')).toBe(true);
  });

  it('two overlapping runs send each message exactly once', async () => {
    db.messages = [message(1), message(2), message(3), message(4)];
    const [a, b] = await Promise.all([sendMessages(request), sendMessages(request)]);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(sent.map((s) => s.id).sort()).toEqual(['msg-001', 'msg-002', 'msg-003', 'msg-004']);
    expect(ja.sent + jb.sent).toBe(4);
  });

  it('skips a row another run claimed between reading and claiming', async () => {
    db.messages = [message(1), message(2)];
    hooks.beforeClaim = () => {
      // The other run's claim lands first.
      db.messages[1].next_attempt_at = new Date(NOW.getTime() + CLAIM_LEASE_MS).toISOString();
      hooks.beforeClaim = undefined;
    };
    const body = await (await sendMessages(request)).json();
    expect(sent.map((s) => s.id)).toEqual(['msg-001']);
    expect(body).toMatchObject({ sent: 1, claimedElsewhere: 1 });
    expect(db.messages[1].status).toBe('pending');
  });

  it('works through more than one batch in a run', async () => {
    db.messages = Array.from({ length: SEND_BATCH_SIZE + 5 }, (_, i) => message(i + 1));
    const body = await (await sendMessages(request)).json();
    expect(body.sent).toBe(SEND_BATCH_SIZE + 5);
    expect(new Set(sent.map((s) => s.id)).size).toBe(SEND_BATCH_SIZE + 5);
  });

  it('hands unsent rows back when the time budget runs out, so the next run sends them straight away', async () => {
    db.messages = [message(1), message(2), message(3)];
    clock.advanceAfterSendMs = 50_000; // the first send takes the run past its budget
    const body = await (await sendMessages(request)).json();
    expect(body).toMatchObject({ sent: 1, released: 2 });
    expect(db.messages.filter((m) => m.status === 'pending').map((m) => m.next_attempt_at)).toEqual([NOW.toISOString(), NOW.toISOString()]);

    clock.advanceAfterSendMs = 0;
    sent.length = 0;
    await sendMessages(request);
    expect(sent.map((s) => s.id)).toEqual(['msg-002', 'msg-003']);
  });

  it('a failure after the email went out is not recorded as a failed send, so it is never retried', async () => {
    db.messages = [message(1, { journey_enrollment_id: 'enr-1', attempts: 4 })];
    advanceJourneyEnrollment.mockImplementation(async () => {
      throw new Error('journey step missing');
    });
    const body = await (await sendMessages(request)).json();
    expect(body).toMatchObject({ sent: 1, failed: 0, retried: 0 });
    expect(db.messages[0]).toMatchObject({ status: 'sent', attempts: 4 });
  });

  it('if recording the send fails, the row stays claimed rather than due, and a later retry reuses the same idempotency key', async () => {
    db.messages = [message(1)];
    hooks.failMarkSent = true;
    await sendMessages(request);
    expect(db.messages[0].status).toBe('pending');
    expect(db.messages[0].next_attempt_at > NOW.toISOString()).toBe(true); // not picked up again by the next run

    hooks.failMarkSent = false;
    jest.setSystemTime(NOW.getTime() + CLAIM_LEASE_MS + 1000);
    await sendMessages(request);
    // The provider drops the repeat: same row, same attempt, same key.
    expect(sent.map((s) => s.key)).toEqual(['pentriq/messages/msg-001/0', 'pentriq/messages/msg-001/0']);
    expect(db.messages[0].status).toBe('sent');
  });
});

describe('/api/send-review-requests', () => {
  const reviewRequest = (n: number): Row => ({
    id: `rr-${n}`, business_id: 'biz-1', customer_id: `cust-${n}`, status: 'pending', send_at: minutesAgo(100 - n), next_attempt_at: null,
    attempts: 0, max_attempts: 5, tracking_token: `t-${n}`,
  });

  it('two overlapping runs send each review request exactly once, with an idempotency key', async () => {
    db.customers = [1, 2, 3].map((n) => ({ id: `cust-${n}`, name: `Customer ${n}`, email: `c${n}@client.example`, unsubscribed_at: null }));
    db.review_requests = [reviewRequest(1), reviewRequest(2), reviewRequest(3)];
    await Promise.all([sendReviewRequests(request), sendReviewRequests(request)]);
    expect(sent.map((s) => s.id).sort()).toEqual(['Customer 1', 'Customer 2', 'Customer 3']);
    expect(sent.find((s) => s.id === 'Customer 1')?.key).toBe('pentriq/review_requests/rr-1/0');
    expect(db.review_requests.every((r) => r.status === 'sent')).toBe(true);
  });
});
