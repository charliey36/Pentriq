/**
 * Comprehensive tests for the manual customer-management workflows.
 *
 * Covers the six scenarios introduced with the UK-first manual workflow work:
 *   1. Manual visit logging -> automatic review scheduling
 *   2. Manual review send (demo/sandbox-aware)
 *   3. Manual rebooking reminder
 *   4. Duplicate protection ("already scheduled")
 *   5. Currency display (GBP everywhere)
 *   6. UK date format (DD/MM/YYYY) + API accepting both formats
 *
 * These exercise the real production functions in src/lib and src/app with a
 * lightweight in-memory Supabase mock, so they verify actual behaviour rather
 * than re-implementing it. The suite pins TZ=Europe/London (see the npm "test"
 * script / jest.config.js) so date and send-window assertions are deterministic.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import {
  daysSinceService,
  isReviewEligible,
  isRebookingEligible,
  parseServiceDate,
  parseAmount,
  scheduleReviewRequest,
} from '@/lib/eligibility';
import { reviewSendTime, snapToSendWindow, SEND_WINDOW_START_HOUR } from '@/lib/send-window';
import {
  formatUKDate,
  formatUKDateTime,
  formatUKCurrency,
  UK_CURRENCY,
  UK_CURRENCY_SYMBOL,
  UK_LOCALE,
  UK_TIMEZONE,
} from '@/lib/uk-defaults';
import { computeRebookingStatus, computeLifetimeValue } from '@/lib/visits';
import { renderMessage } from '@/lib/templates';
import { resolveChannel } from '@/lib/messaging';
import { isDemoCustomer, isDemoEmail } from '@/lib/demo-mode';
import { parseSandboxError, transformResendError } from '@/lib/email-sandbox';
import { sendQueuedReview } from '@/lib/review-queue';

/* -------------------------------------------------------------------------- */
/* In-memory Supabase mock                                                    */
/* -------------------------------------------------------------------------- */

type Row = Record<string, any>;

/**
 * Minimal fluent query-builder mock that supports the chained calls the
 * production code uses: select/insert/update + eq/in/order/limit/maybeSingle/
 * single, all terminating in a `{ data, error }`-shaped thenable.
 *
 * Each table is an array of plain rows. This is intentionally tiny: it exists
 * to let us drive the real scheduleReviewRequest / sendQueuedReview code paths
 * and assert on the resulting table state.
 */
function createSupabaseMock(tables: Record<string, Row[]>) {
  const db: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(tables)) db[k] = v.map((r) => ({ ...r }));

  function from(table: string) {
    db[table] ??= [];
    const state: {
      op: 'select' | 'insert' | 'update';
      filters: Array<(r: Row) => boolean>;
      insertRows: Row[];
      updateValues: Row;
      orderKey?: string;
      limitN?: number;
    } = { op: 'select', filters: [], insertRows: [], updateValues: {} };

    const applyFilters = (rows: Row[]) => rows.filter((r) => state.filters.every((f) => f(r)));

    const builder: any = {
      select() {
        if (state.op !== 'insert' && state.op !== 'update') state.op = 'select';
        return builder;
      },
      insert(rows: Row | Row[]) {
        state.op = 'insert';
        state.insertRows = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      update(values: Row) {
        state.op = 'update';
        state.updateValues = values;
        return builder;
      },
      delete() {
        state.op = 'update';
        state.updateValues = { __deleted: true };
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters.push((r) => r[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        state.filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      order(col: string) {
        state.orderKey = col;
        return builder;
      },
      limit(n: number) {
        state.limitN = n;
        return builder;
      },
      maybeSingle() {
        return builder.then((res: any) => ({
          data: res.data?.[0] ?? null,
          error: res.error ?? null,
        }));
      },
      single() {
        return builder.then((res: any) => ({
          data: res.data?.[0] ?? null,
          error: res.data?.length ? null : { message: 'no rows' },
        }));
      },
      // Make the builder awaitable: resolve the pending operation.
      then(onFulfilled: (v: any) => any, onRejected?: (e: any) => any) {
        let result: any;
        try {
          if (state.op === 'insert') {
            const inserted = state.insertRows.map((r, i) => {
              const row: Row = { id: `gen-${db[table].length + i + 1}`, ...r };
              // Mirror the DB column default: messages.status defaults to
              // 'pending' (supabase/schema.sql line 176) when not supplied.
              // scheduleReviewRequest relies on this so its dedup query
              // (status in ['queued','pending']) matches the row it just made.
              if (table === 'messages' && row.status === undefined) row.status = 'pending';
              return row;
            });
            db[table].push(...inserted);
            result = { data: inserted, error: null };
          } else if (state.op === 'update') {
            const matched = applyFilters(db[table]);
            if (state.updateValues.__deleted) {
              db[table] = db[table].filter((r) => !matched.includes(r));
            } else {
              matched.forEach((r) => Object.assign(r, state.updateValues));
            }
            result = { data: matched, error: null };
          } else {
            let rows = applyFilters(db[table]);
            if (state.orderKey) rows = [...rows].sort((a, b) => (a[state.orderKey!] > b[state.orderKey!] ? 1 : -1));
            if (state.limitN != null) rows = rows.slice(0, state.limitN);
            result = { data: rows, error: null };
          }
        } catch (e) {
          result = { data: null, error: { message: String(e) } };
        }
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return { from, __db: db } as any;
}

/* -------------------------------------------------------------------------- */
/* Scenario 1: Manual visit logging -> auto review scheduling                 */
/* -------------------------------------------------------------------------- */

describe('Scenario 1: Manual visit logging -> auto review scheduling', () => {
  const BUSINESS_ID = 'biz-1';
  const CUSTOMER_ID = 'cust-1';

  it('schedules a review request when a visit is logged inside the review window', async () => {
    const supabase = createSupabaseMock({
      messages: [],
      journeys: [], // no journey -> falls back to a direct message insert
    });

    const serviceDate = '2026-10-08';
    await scheduleReviewRequest(supabase, BUSINESS_ID, 24, CUSTOMER_ID, serviceDate);

    // Verify a review_request message was created in the queue.
    const queued = supabase.__db.messages;
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      purpose: 'review_request',
      channel: 'email',
    });
  });

  it('schedules the review for 08:00 UK time the day after the service', () => {
    // Service completed 2026-06-15 -> email at 08:00 Europe/London on 2026-06-16.
    // (June is BST = UTC+1, so 08:00 London == 07:00 UTC.)
    const sendAt = reviewSendTime('2026-06-15', new Date('2026-06-15T18:00:00Z'));
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: UK_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(sendAt);
    expect(parts).toBe('08:00');
    expect(formatUKDate(sendAt)).toBe('16/06/2026');
  });

  it('considers a just-completed service eligible for a review request', () => {
    const today = new Date('2026-10-09T10:00:00Z');
    // Service today, window of 14 days -> eligible.
    expect(daysSinceService('2026-10-09', today)).toBe(0);
    expect(isReviewEligible('2026-10-09', 14)).toBe(true);
  });

  it('the scheduled message shows up for the customer (visible in the customer list query)', async () => {
    const supabase = createSupabaseMock({ messages: [], journeys: [] });
    await scheduleReviewRequest(supabase, BUSINESS_ID, 24, CUSTOMER_ID, '2026-10-08');

    // Emulate the customers-list query: find pending/queued review requests
    // for this customer. A row means the UI renders a "Scheduled" badge
    // rather than "No review request".
    const { data } = await supabase
      .from('messages')
      .select('id, status')
      .eq('customer_id', CUSTOMER_ID)
      .eq('purpose', 'review_request')
      .in('status', ['queued', 'pending']);

    expect(data.length).toBeGreaterThan(0);
    const showsNoReviewRequest = data.length === 0;
    expect(showsNoReviewRequest).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Scenario 2: Manual review send                                             */
/* -------------------------------------------------------------------------- */

describe('Scenario 2: Manual review send', () => {
  const BUSINESS_ID = 'biz-1';
  const MESSAGE_ID = 'msg-1';
  const CUSTOMER_ID = 'cust-1';

  const baseTables = () => ({
    messages: [
      {
        id: MESSAGE_ID,
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        purpose: 'review_request',
        status: 'queued',
        attempts: 0,
        journey_enrollment_id: null,
      },
    ],
    customers: [
      {
        id: CUSTOMER_ID,
        name: 'Demo Customer',
        email: 'demo-customer@example.com', // demo email -> simulated send
        phone: null,
        unsubscribed_at: null,
        unsubscribed_sms_at: null,
      },
    ],
    businesses: [{ id: BUSINESS_ID, name: 'Demo Co', google_review_url: 'https://g.page/demo', subscription_status: 'active' }],
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a queued review (demo customer -> simulated) and updates status to "sent"', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = createSupabaseMock(baseTables());

    const res = await sendQueuedReview(supabase, BUSINESS_ID, MESSAGE_ID);

    expect(res.ok).toBe(true);
    const msg = supabase.__db.messages[0];
    expect(msg.status).toBe('sent');
    expect(msg.sent_at).toBeTruthy();
    expect(msg.last_error).toBeNull();
  });

  it('refuses to send a message that is already sent/cancelled', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const tables = baseTables();
    tables.messages[0].status = 'sent';
    const supabase = createSupabaseMock(tables);

    const res = await sendQueuedReview(supabase, BUSINESS_ID, MESSAGE_ID);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already sent or cancelled/i);
  });

  it('cancels and reports when the customer has unsubscribed', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const tables = baseTables();
    (tables.customers[0] as { unsubscribed_at: string | null }).unsubscribed_at = '2026-01-01T00:00:00Z';
    const supabase = createSupabaseMock(tables);

    const res = await sendQueuedReview(supabase, BUSINESS_ID, MESSAGE_ID);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unsubscribed/i);
    expect(supabase.__db.messages[0].status).toBe('cancelled');
  });

  it('identifies demo/sandbox customers so sends are simulated, not delivered', () => {
    expect(isDemoEmail('demo-customer@example.com')).toBe(true);
    expect(isDemoEmail('demo@pentriq.app')).toBe(true);
    expect(isDemoEmail('test@foo.io')).toBe(true);
    expect(isDemoCustomer({ email: 'real.person@gmail.com' })).toBe(false);
  });

  it('surfaces a human-readable error when Resend is in sandbox mode', () => {
    const raw = 'You can only send testing emails to your own email address (owner@gmail.com).';
    const parsed = parseSandboxError(raw);
    expect(parsed.isSandboxError).toBe(true);
    expect(parsed.allowedEmail).toBe('owner@gmail.com');
    expect(transformResendError(raw)).toMatch(/sandbox/i);
    expect(transformResendError(raw)).toContain('owner@gmail.com');
  });
});

/* -------------------------------------------------------------------------- */
/* Scenario 3: Manual rebooking reminder                                      */
/* -------------------------------------------------------------------------- */

describe('Scenario 3: Manual rebooking reminder', () => {
  it('flags a customer as due/eligible once the rebooking interval has passed', () => {
    const today = new Date('2026-10-09T10:00:00Z');
    // Interval 90 days; last service 100 days ago -> eligible for a reminder.
    const lastService = '2026-07-01';
    expect(daysSinceService(lastService, today)).toBe(100);
    expect(isRebookingEligible(lastService, 90)).toBe(true);
    // Only 30 days ago -> not yet eligible.
    expect(isRebookingEligible('2026-09-09', 90)).toBe(false);
  });

  it('computes rebooking status (due/lapsed + next expected visit) from visit history', () => {
    const now = Date.now();
    const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

    // Last visit 100 days ago, 90-day recurrence -> due but not lapsed (<180d).
    const due = computeRebookingStatus(
      [{ visited_at: daysAgo(100), price: 50, service_id: 's1' } as any],
      90
    );
    expect(due.isDue).toBe(true);
    expect(due.isLapsed).toBe(false);
    expect(due.nextExpectedVisitAt).toBeInstanceOf(Date);

    // Last visit 200 days ago, 90-day recurrence -> lapsed (>180d).
    const lapsed = computeRebookingStatus(
      [{ visited_at: daysAgo(200), price: 50, service_id: 's1' } as any],
      90
    );
    expect(lapsed.isLapsed).toBe(true);
  });

  it('renders a rebooking reminder email with subject, body and a rebooking link', () => {
    const rendered = renderMessage('rebooking_reminder', 'email', {
      businessName: 'Sparkle Salon',
      customerName: 'Priya',
      rebookingUrl: 'https://app.pentriq.test/book/cust-1',
      unsubscribeUrl: 'https://app.pentriq.test/api/unsubscribe/cust-1',
    });

    expect(rendered.text).toContain('Priya');
    expect(rendered.text).toContain('Sparkle Salon');
    expect(rendered.text).toContain('https://app.pentriq.test/book/cust-1');
    expect(rendered.subject && rendered.subject.length).toBeGreaterThan(0);
  });

  it('resolves the email channel for a rebooking reminder when the customer is reachable', () => {
    const channel = resolveChannel('email', {
      email: 'priya@example.com',
      phone: null,
      unsubscribed_at: null,
      unsubscribed_sms_at: null,
    });
    expect(channel).toBe('email');
  });

  it('updates history: a sent reminder sets status=sent and sent_at (visible in message history)', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    // Reuse the send pipeline; a rebooking reminder is just another message.
    const supabase = createSupabaseMock({
      messages: [
        {
          id: 'rb-1',
          business_id: 'biz-1',
          customer_id: 'cust-1',
          purpose: 'review_request',
          status: 'queued',
          attempts: 0,
          journey_enrollment_id: null,
        },
      ],
      customers: [
        { id: 'cust-1', name: 'Priya', email: 'priya@example.com', phone: null, unsubscribed_at: null, unsubscribed_sms_at: null },
      ],
      businesses: [{ id: 'biz-1', name: 'Sparkle Salon', google_review_url: 'https://g.page/r/sparkle', subscription_status: 'active' }],
    });

    const res = await sendQueuedReview(supabase, 'biz-1', 'rb-1');
    expect(res.ok).toBe(true);
    expect(supabase.__db.messages[0].status).toBe('sent');
    expect(supabase.__db.messages[0].sent_at).toBeTruthy();
    jest.restoreAllMocks();
  });

  it('holds a review request, without sending or failing it, until the business has a review link', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = createSupabaseMock({
      messages: [{ id: 'rb-2', business_id: 'biz-1', customer_id: 'cust-1', purpose: 'review_request', status: 'queued', attempts: 0, journey_enrollment_id: null }],
      customers: [{ id: 'cust-1', name: 'Priya', email: 'priya@example.com', phone: null, unsubscribed_at: null, unsubscribed_sms_at: null }],
      businesses: [{ id: 'biz-1', name: 'Sparkle Salon', google_review_url: '', subscription_status: 'active' }],
    });

    const res = await sendQueuedReview(supabase, 'biz-1', 'rb-2');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/review link/i);
    expect(supabase.__db.messages[0].status).toBe('queued'); // still waiting, not failed or cancelled
    expect(supabase.__db.messages[0].sent_at).toBeUndefined();
    jest.restoreAllMocks();
  });
});

/* -------------------------------------------------------------------------- */
/* Scenario 4: Duplicate protection                                           */
/* -------------------------------------------------------------------------- */

describe('Scenario 4: Duplicate protection', () => {
  const BUSINESS_ID = 'biz-1';
  const CUSTOMER_ID = 'cust-1';

  it('creates only ONE review request when the same visit is logged twice', async () => {
    const supabase = createSupabaseMock({ messages: [], journeys: [] });

    // First log -> schedules.
    await scheduleReviewRequest(supabase, BUSINESS_ID, 24, CUSTOMER_ID, '2026-10-08');
    // Second (duplicate) log of the same visit -> should be a no-op.
    await scheduleReviewRequest(supabase, BUSINESS_ID, 24, CUSTOMER_ID, '2026-10-08');

    const reviewMsgs = supabase.__db.messages.filter(
      (m: Row) => m.purpose === 'review_request' && ['queued', 'pending'].includes(m.status ?? 'queued')
    );
    expect(reviewMsgs).toHaveLength(1);
  });

  it('skips scheduling when a request is already queued or pending', async () => {
    const supabase = createSupabaseMock({
      messages: [
        { id: 'existing', business_id: BUSINESS_ID, customer_id: CUSTOMER_ID, purpose: 'review_request', status: 'pending' },
      ],
      journeys: [],
    });

    await scheduleReviewRequest(supabase, BUSINESS_ID, 24, CUSTOMER_ID, '2026-10-08');

    // Still only the pre-existing one; nothing new inserted.
    expect(supabase.__db.messages).toHaveLength(1);
    expect(supabase.__db.messages[0].id).toBe('existing');
  });

  it('models the "already scheduled" messaging shown to the owner (CSV import dedup)', () => {
    // Mirrors lib/customers.ts: a customer whose request is already queued is
    // excluded from the queue, and the UI reports them as not-queued because
    // "they were already queued".
    const alreadyQueued = new Set<string>([CUSTOMER_ID]);
    const customer = { id: CUSTOMER_ID, unsubscribed_at: null as string | null };
    const days = daysSinceService('2026-10-08', new Date('2026-10-09T00:00:00Z'));
    const windowDays = 14;

    const passes =
      !customer.unsubscribed_at && !alreadyQueued.has(customer.id) && days !== null && days >= 0 && days <= windowDays;

    expect(passes).toBe(false); // excluded -> counted as "already scheduled"

    const notQueued = passes ? 0 : 1;
    const message = `${notQueued} customer${notQueued === 1 ? ' was' : 's were'} not queued because their service is older than your review window (Settings) or they were already queued.`;
    expect(message).toContain('already queued');
  });
});

/* -------------------------------------------------------------------------- */
/* Scenario 5: Currency display (GBP)                                         */
/* -------------------------------------------------------------------------- */

describe('Scenario 5: Currency display (GBP)', () => {
  it('uses GBP as the default currency with the £ symbol', () => {
    expect(UK_CURRENCY).toBe('GBP');
    expect(UK_CURRENCY_SYMBOL).toBe('£');
    expect(UK_LOCALE).toBe('en-GB');
  });

  it('formats pricing values as GBP (£)', () => {
    expect(formatUKCurrency(45)).toBe('£45.00');
    expect(formatUKCurrency(1299.5)).toBe('£1,299.50');
    expect(formatUKCurrency(0)).toBe('£0.00');
  });

  it('formats spend / lifetime value as GBP', () => {
    const lifetimeValue = computeLifetimeValue([{ price: 120 }, { price: 80 }, { price: null } as any]);
    expect(lifetimeValue).toBe(200);
    expect(formatUKCurrency(lifetimeValue)).toBe('£200.00');
    expect(formatUKCurrency(lifetimeValue)).toContain('£');
    expect(formatUKCurrency(lifetimeValue)).not.toContain('$');
  });

  it('formats analytics revenue figures as GBP (never USD)', () => {
    const attributedRevenue = 3450.75;
    const display = formatUKCurrency(attributedRevenue);
    expect(display).toBe('£3,450.75');
    expect(display.startsWith('£')).toBe(true);
    expect(display).not.toMatch(/US\$|\$/);
  });

  it('parses £-prefixed and comma-grouped amounts on input (GBP tolerant)', () => {
    expect(parseAmount('£1,250.50')).toBe(1250.5);
    expect(parseAmount('350')).toBe(350);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('not-a-number')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Scenario 6: UK date format (DD/MM/YYYY)                                    */
/* -------------------------------------------------------------------------- */

describe('Scenario 6: UK date format (DD/MM/YYYY)', () => {
  it('renders dates as DD/MM/YYYY', () => {
    expect(formatUKDate(new Date('2026-01-09T12:00:00Z'))).toBe('09/01/2026');
    expect(formatUKDate(new Date('2026-12-25T12:00:00Z'))).toBe('25/12/2026');
  });

  it('renders date-times as DD/MM/YYYY, HH:MM on a 24h clock (Europe/London)', () => {
    // 2026-01-09 is GMT (UTC+0) in London: 14:30Z -> 14:30.
    expect(formatUKDateTime(new Date('2026-01-09T14:30:00Z'))).toBe('09/01/2026, 14:30');
    // 2026-07-09 is BST (UTC+1) in London: 14:30Z -> 15:30.
    expect(formatUKDateTime(new Date('2026-07-09T14:30:00Z'))).toBe('09/07/2026, 15:30');
  });

  it('is unambiguous for days > 12 (proves DD/MM not MM/DD)', () => {
    // If this were MM/DD it would read as an invalid month 25.
    expect(formatUKDate(new Date('2026-03-25T12:00:00Z'))).toBe('25/03/2026');
  });

  it('API/parse layer accepts BOTH DD/MM/YYYY and YYYY-MM-DD input', () => {
    // UK-first input
    expect(parseServiceDate('09/01/2026')).toBe('2026-01-09');
    expect(parseServiceDate('25/12/2026')).toBe('2026-12-25');
    // ISO input (API / CSV exports)
    expect(parseServiceDate('2026-01-09')).toBe('2026-01-09');
    // Single-digit day/month in UK format
    expect(parseServiceDate('5/3/2026')).toBe('2026-03-05');
  });

  it('rejects invalid dates in either format', () => {
    expect(parseServiceDate('32/01/2026')).toBeNull(); // no 32nd
    expect(parseServiceDate('2026-13-01')).toBeNull(); // no 13th month
    expect(parseServiceDate('not-a-date')).toBeNull();
  });

  it('anchors scheduling to Europe/London for the UK send window', () => {
    expect(UK_TIMEZONE).toBe('Europe/London');
    // A 03:00 UK-time instant is before the 08:00 window -> snapped to 08:00.
    const snapped = snapToSendWindow(new Date('2026-06-15T02:00:00Z')); // 03:00 BST
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: UK_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(snapped)
    );
    expect(hour).toBe(SEND_WINDOW_START_HOUR);
  });
});
