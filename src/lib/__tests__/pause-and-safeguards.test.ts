import { describe, expect, it } from '@jest/globals';
import { PAUSE_OPTIONS, estimatedValue, isPauseOption, isPaused, pauseEnd } from '@/lib/pause';
import { sendBlockedReason, getBillingState } from '@/lib/billing';
import { FREQUENCY_PRESETS, addSuppression, frequencyChoice, recordBlocks, suppressedEmails } from '@/lib/safeguards';
import { unsubscribeCustomer } from '@/lib/unsubscribe';
import { advanceJourneyEnrollment, enrollCustomerInJourney } from '@/lib/journeys';
import { reminderDisabled, loadPersonalisation } from '@/lib/review-personalisation';
import { bulkImportCustomers } from '@/lib/customers';
import { extractReviewSchedulingLogic } from '@/lib/review-scheduling';
import { loadPipelineStats } from '@/lib/pipeline-stats';
import { MiniDb } from './helpers/mini-db';

const NOW = new Date('2026-10-27T10:00:00Z');
const active = { subscription_status: 'active' as const, trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' };
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe('pause subscription', () => {
  it('offers 1 month, 3 months and indefinite', () => {
    expect(PAUSE_OPTIONS.map((o) => o.key)).toEqual(['1m', '3m', 'indefinite']);
    expect(isPauseOption('3m')).toBe(true);
    expect(isPauseOption('forever')).toBe(false);
  });
  it('computes the end date', () => {
    expect(pauseEnd('1m', NOW)!.toISOString().slice(0, 10)).toBe('2026-11-27');
    expect(pauseEnd('3m', NOW)!.toISOString().slice(0, 10)).toBe('2027-01-27');
    expect(pauseEnd('indefinite', NOW)).toBeNull();
  });
  it('isPaused: timed pauses expire, indefinite ones do not, unpaused is false', () => {
    expect(isPaused({}, NOW)).toBe(false);
    expect(isPaused({ paused_at: NOW.toISOString(), paused_until: '2026-11-27T00:00:00Z' }, NOW)).toBe(true);
    expect(isPaused({ paused_at: '2026-01-01T00:00:00Z', paused_until: '2026-02-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isPaused({ paused_at: '2026-01-01T00:00:00Z', pause_indefinite: true }, NOW)).toBe(true);
  });
  it('a paused business cannot send; an active one can; resuming restores sending', () => {
    expect(sendBlockedReason({ ...active }, NOW)).toBeNull();
    expect(sendBlockedReason({ ...active, paused_at: NOW.toISOString(), pause_indefinite: true }, NOW)).toMatch(/paused/i);
    expect(sendBlockedReason({ ...active, paused_at: null, paused_until: null, pause_indefinite: false }, NOW)).toBeNull();
    // billing status itself is unchanged by a pause
    expect(getBillingState({ ...active, paused_at: NOW.toISOString(), pause_indefinite: true }, NOW).status).toBe('active');
  });
  it('estimates value transparently', () => {
    expect(estimatedValue(0)).toBe(0);
    expect(estimatedValue(10)).toBe(250);
  });
});

describe('frequency options', () => {
  it('maps stored days to 30/60/90/custom', () => {
    expect(FREQUENCY_PRESETS).toEqual([30, 60, 90]);
    expect(frequencyChoice(30)).toBe('30');
    expect(frequencyChoice(90)).toBe('90');
    expect(frequencyChoice(45)).toBe('custom');
  });
});

describe('unsubscribe / suppression', () => {
  function seed() {
    const db = new MiniDb();
    db.rows('customers').push({ id: 'c1', business_id: 'b1', email: 'Sam@X.com', unsubscribed_at: null });
    db.rows('messages').push(
      { id: 'm1', customer_id: 'c1', business_id: 'b1', purpose: 'review_reminder', status: 'pending' },
      { id: 'm2', customer_id: 'c1', business_id: 'b1', purpose: 'review_request', status: 'queued' },
      { id: 'm3', customer_id: 'c1', business_id: 'b1', purpose: 'review_request', status: 'sent' }
    );
    db.rows('journey_enrollments').push({ id: 'e1', customer_id: 'c1', status: 'active' });
    return db;
  }
  it('opt-out marks the customer, suppresses the email and cancels everything still waiting', async () => {
    const db = seed();
    expect(await unsubscribeCustomer(db as never, 'c1')).toBe('ok');
    expect(db.rows('customers')[0].unsubscribed_at).toBeTruthy();
    expect(db.rows('email_suppressions')).toMatchObject([{ business_id: 'b1', email: 'sam@x.com' }]);
    expect(db.rows('messages').map((m) => m.status)).toEqual(['cancelled', 'cancelled', 'sent']);
    expect(db.rows('journey_enrollments')[0].status).toBe('exited');
  });
  it('is idempotent and keeps the original opt-out time', async () => {
    const db = seed();
    await unsubscribeCustomer(db as never, 'c1');
    const first = db.rows('customers')[0].unsubscribed_at;
    await unsubscribeCustomer(db as never, 'c1');
    expect(db.rows('customers')[0].unsubscribed_at).toBe(first);
    expect(db.rows('email_suppressions')).toHaveLength(1);
  });
  it('unknown customers are reported, not created', async () => {
    expect(await unsubscribeCustomer(new MiniDb() as never, 'nope')).toBe('not_found');
  });
  it('suppression survives deleting the customer and is case-insensitive', async () => {
    const db = new MiniDb();
    await addSuppression(db as never, 'b1', ' Sam@X.com ');
    expect([...(await suppressedEmails(db as never, 'b1', ['sam@x.com', 'other@x.com']))]).toEqual(['sam@x.com']);
    expect((await suppressedEmails(db as never, 'b2', ['sam@x.com'])).size).toBe(0); // per business
  });
  it('safeguard bookkeeping never throws', async () => {
    const broken = { from: () => { throw new Error('table missing'); } };
    await expect(recordBlocks(broken as never, 'b', [{ reason: 'duplicate' }])).resolves.toBeUndefined();
    await expect(addSuppression(broken as never, 'b', 'a@b.c')).resolves.toBeUndefined();
    expect((await suppressedEmails(broken as never, 'b', ['a@b.c'])).size).toBe(0);
  });
});

describe('CSV import safeguards', () => {
  const BIZ = { id: 'b1', delay_hours: 2, review_request_window_days: 14, review_cooldown_enabled: true, review_cooldown_days: 30 };
  const row = (email: string, date: string, extra: object = {}) => ({ name: 'N', email, service: 'Repair', date, phone: null, amountSpent: null, ...extra });
  const blocks = (db: MiniDb) => db.rows('review_request_blocks').map((b) => b.reason);

  it('blocks and counts a customer inside the frequency window (30 days)', async () => {
    const db = new MiniDb();
    db.rows('customers').push({ id: 'c1', business_id: 'b1', name: 'N', email: 'a@x.com', phone: null, total_spend: 0, visit_count: 1, last_service_date: day(40), unsubscribed_at: null });
    db.rows('messages').push({ id: 'old', business_id: 'b1', customer_id: 'c1', purpose: 'review_request', status: 'sent', sent_at: new Date(Date.now() - 10 * 86_400_000).toISOString() });
    const s = await bulkImportCustomers(db as never, BIZ, [row('a@x.com', day(1))], false);
    expect(s.queued).toBe(0);
    expect(blocks(db)).toEqual(['frequency']);
  });
  it('allows a new request once the window has passed', async () => {
    const db = new MiniDb();
    db.rows('customers').push({ id: 'c1', business_id: 'b1', name: 'N', email: 'a@x.com', phone: null, total_spend: 0, visit_count: 1, last_service_date: day(60), unsubscribed_at: null });
    db.rows('messages').push({ id: 'old', business_id: 'b1', customer_id: 'c1', purpose: 'review_request', status: 'sent', sent_at: new Date(Date.now() - 45 * 86_400_000).toISOString() });
    const s = await bulkImportCustomers(db as never, BIZ, [row('a@x.com', day(1))], false);
    expect(s.queued).toBe(1);
    expect(blocks(db)).toEqual([]);
  });
  it('blocks opted-out customers, including suppressed emails whose record was deleted', async () => {
    const db = new MiniDb();
    db.rows('customers').push({ id: 'c1', business_id: 'b1', name: 'N', email: 'out@x.com', phone: null, total_spend: 0, visit_count: 1, last_service_date: day(60), unsubscribed_at: '2026-01-01T00:00:00Z' });
    db.rows('email_suppressions').push({ business_id: 'b1', email: 'gone@x.com' });
    const s = await bulkImportCustomers(db as never, BIZ, [row('out@x.com', day(1)), row('gone@x.com', day(1))], true);
    expect(s.queued).toBe(0);
    expect(blocks(db).sort()).toEqual(['opt_out', 'opt_out']);
    const gone = db.rows('customers').find((c) => c.email === 'gone@x.com')!;
    expect(gone.unsubscribed_at).toBeTruthy(); // re-created, but never contactable
  });
  it('blocks an appointment that is already recorded or already queued (duplicates)', async () => {
    const db = new MiniDb();
    await bulkImportCustomers(db as never, { ...BIZ, review_cooldown_enabled: false }, [row('a@x.com', day(1))], false);
    const again = await bulkImportCustomers(db as never, { ...BIZ, review_cooldown_enabled: false }, [row('a@x.com', day(1))], false);
    expect(again.duplicates).toBe(1);
    expect(again.serviceRecordsAdded).toBe(0);
    expect(db.rows('messages').filter((m) => m.purpose === 'review_request')).toHaveLength(1);
    expect(blocks(db)).toContain('duplicate');
    // same file twice in one upload
    const db2 = new MiniDb();
    await bulkImportCustomers(db2 as never, BIZ, [row('b@x.com', day(1)), row('b@x.com', day(1))], false);
    expect(blocks(db2)).toEqual(['duplicate']);
  });
  it('stores the staff member on the visit', async () => {
    const db = new MiniDb();
    await bulkImportCustomers(db as never, BIZ, [row('s@x.com', day(1), { staff: 'Alex' })], false);
    expect(db.rows('visits')[0].staff_name).toBe('Alex');
  });
});

describe('manual scheduling safeguards', () => {
  it('records opt-out, frequency and duplicate blocks', async () => {
    const db = new MiniDb();
    await extractReviewSchedulingLogic(db as never, 'b1', 'c1', { unsubscribedAt: '2026-01-01' });
    db.rows('messages').push({ business_id: 'b1', customer_id: 'c2', purpose: 'review_request', status: 'sent', sent_at: new Date().toISOString() });
    await extractReviewSchedulingLogic(db as never, 'b1', 'c2', { cooldownDays: 30, serviceDate: day(0) });
    db.rows('messages').push({ business_id: 'b1', customer_id: 'c3', purpose: 'review_request', status: 'queued' });
    await extractReviewSchedulingLogic(db as never, 'b1', 'c3', {});
    expect(db.rows('review_request_blocks').map((b) => b.reason)).toEqual(['opt_out', 'frequency', 'duplicate']);
  });
});

describe('reminders', () => {
  const journey = { id: 'j1', business_id: 'b1', steps: [
    { wait_hours: 0, channel: 'email', purpose: 'review_request' },
    { wait_hours: 72, channel: 'email', purpose: 'review_reminder' },
    { wait_hours: 168, channel: 'email', purpose: 'review_reminder' },
  ] };
  it('schedules request -> reminder 1 -> reminder 2 once each, never twice, then completes', async () => {
    const db = new MiniDb();
    db.rows('journeys').push(journey);
    await enrollCustomerInJourney(db as never, journey as never, 'c1', new Date(), 'visit-1');
    const enrollment = db.rows('journey_enrollments')[0];
    expect(db.rows('messages')[0]).toMatchObject({ sequence_step: 1, purpose: 'review_request', visit_id: 'visit-1' });
    await advanceJourneyEnrollment(db as never, enrollment.id);
    // a second cron run advancing the same enrollment must not duplicate the step
    enrollment.current_step = 0;
    await advanceJourneyEnrollment(db as never, enrollment.id);
    expect(db.rows('messages').map((m) => m.sequence_step)).toEqual([1, 2]);
    await advanceJourneyEnrollment(db as never, enrollment.id);
    expect(db.rows('messages').map((m) => m.sequence_step)).toEqual([1, 2, 3]);
    await advanceJourneyEnrollment(db as never, enrollment.id);
    expect(enrollment.status).toBe('completed');
    expect(db.rows('messages')).toHaveLength(3);
  });
  it('does not double-enroll an active customer', async () => {
    const db = new MiniDb();
    await enrollCustomerInJourney(db as never, journey as never, 'c1', new Date());
    await enrollCustomerInJourney(db as never, journey as never, 'c1', new Date());
    expect(db.rows('journey_enrollments')).toHaveLength(1);
  });
  it('can be switched off per business, but only affects reminders', () => {
    expect(reminderDisabled({ review_reminders_enabled: false }, 'review_reminder')).toBe(true);
    expect(reminderDisabled({ review_reminders_enabled: false }, 'review_request')).toBe(false);
    expect(reminderDisabled({ review_reminders_enabled: true }, 'review_reminder')).toBe(false);
    expect(reminderDisabled({}, 'review_reminder')).toBe(false); // pre-migration businesses keep reminders
  });
});

describe('personalisation loading', () => {
  it('reads service, staff and date from the visit, and copes with a missing visit', async () => {
    const db = new MiniDb();
    db.rows('services').push({ id: 's1', name: 'Boiler Repair' });
    db.rows('visits').push({ id: 'v1', service_id: 's1', staff_name: 'Alex', visited_at: '2026-10-14T12:00:00Z' });
    const p = await loadPersonalisation(db as never, { review_message_subject: 'S', review_message_body: 'B' }, { visit_id: 'v1' });
    expect(p).toMatchObject({ customSubject: 'S', customBody: 'B', serviceName: 'Boiler Repair', staffName: 'Alex', appointmentDate: '14 October 2026' });
    expect(await loadPersonalisation(db as never, {}, { visit_id: null })).toMatchObject({ serviceName: null, customBody: null });
  });
});

describe('dashboard pipeline calculations', () => {
  it('counts requests, each reminder step, completions and blocks separately', async () => {
    const db = new MiniDb();
    const m = (purpose: string, step: number, status = 'sent') => ({ business_id: 'b1', purpose, sequence_step: step, status });
    db.rows('messages').push(m('review_request', 1), m('review_request', 1), m('review_reminder', 2), m('review_reminder', 3), m('review_reminder', 3), m('review_reminder', 2, 'cancelled'));
    db.rows('review_request_blocks').push({ business_id: 'b1', reason: 'frequency' }, { business_id: 'b1', reason: 'frequency' }, { business_id: 'b1', reason: 'opt_out' }, { business_id: 'b2', reason: 'duplicate' });
    const s = await loadPipelineStats(db as never, 'b1');
    expect(s).toMatchObject({ requestsSent: 2, reminder1Sent: 1, reminder2Sent: 2, blocked: { frequency: 2, opt_out: 1, duplicate: 0 } });
  });
});
