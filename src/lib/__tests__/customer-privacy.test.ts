/** @jest-environment node */
import { MiniDb } from './helpers/mini-db';
import { collectCustomerData, eraseCustomer, escapeLike } from '../customer-privacy';

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  },
}));

const B = 'biz-1';
const C = 'cust-1';

function seed() {
  const db = new MiniDb();
  db.rows('customers').push(
    { id: C, business_id: B, name: 'Ann Lee', email: 'Ann@Example.com' },
    { id: 'other', business_id: B, name: 'Bo', email: 'bo@example.com' },
    { id: 'foreign', business_id: 'biz-2', name: 'Ann Lee', email: 'ann@example.com' }
  );
  db.rows('visits').push({ id: 'v1', business_id: B, customer_id: C, price: 40 }, { id: 'v2', business_id: B, customer_id: 'other', price: 10 });
  db.rows('messages').push({ id: 'm1', business_id: B, customer_id: C, purpose: 'review_request', tracking_token: 'secret-token' });
  db.rows('private_feedback').push({ id: 'f1', business_id: B, customer_id: C, comment: 'Lovely' });
  db.rows('referrals').push({ id: 'r1', business_id: B, referrer_customer_id: 'other', referee_customer_id: C, code: 'X' });
  return db;
}

describe('customer data export (subject access)', () => {
  it('collects every linked record for that customer only, without internal tokens', async () => {
    const db = seed();
    const out = await collectCustomerData(db as never, B, C, new Date('2026-11-03T12:00:00Z'));
    expect(out?.format).toBe('pentriq.customer-export');
    expect(out?.customer).toMatchObject({ id: C, name: 'Ann Lee' });
    expect(out?.visits).toHaveLength(1);
    expect(out?.messages).toEqual([{ id: 'm1', business_id: B, customer_id: C, purpose: 'review_request' }]);
    expect(out?.private_feedback).toHaveLength(1);
    expect(out?.referrals).toHaveLength(1);
    expect(out?.on_do_not_contact_list).toBe(false);
  });

  it('refuses customers of another business', async () => {
    expect(await collectCustomerData(seed() as never, B, 'foreign')).toBeNull();
  });
});

describe('customer erasure', () => {
  it('requires the exact name, then deletes the customer and keeps them on the do-not-contact list', async () => {
    const db = seed();
    const wrong = await eraseCustomer(db as never, db as never, { businessId: B, customerId: C, confirmName: 'Ann', keepOnDoNotContactList: true });
    expect(wrong).toMatchObject({ ok: false });
    expect(db.rows('customers').some((c) => c.id === C)).toBe(true);

    const res = await eraseCustomer(db as never, db as never, { businessId: B, customerId: C, confirmName: '  ann lee ', keepOnDoNotContactList: true });
    expect(res).toMatchObject({ ok: true, email: 'ann@example.com' });
    expect(db.rows('customers').map((c) => c.id).sort()).toEqual(['foreign', 'other']);
    expect(db.rows('email_suppressions')).toEqual([expect.objectContaining({ business_id: B, email: 'ann@example.com', reason: 'erased' })]);
  });

  it('can erase without keeping a suppression, and never touches other businesses', async () => {
    const db = seed();
    const res = await eraseCustomer(db as never, db as never, { businessId: 'biz-2', customerId: C, confirmName: 'Ann Lee', keepOnDoNotContactList: false });
    expect(res).toMatchObject({ ok: false, error: 'Customer not found.' });
    const ok = await eraseCustomer(db as never, db as never, { businessId: B, customerId: C, confirmName: 'Ann Lee', keepOnDoNotContactList: false });
    expect(ok.ok).toBe(true);
    expect(db.rows('email_suppressions')).toEqual([]);
  });

  it('escapes LIKE wildcards in emails', () => {
    expect(escapeLike('a_b%c\\d@x.co')).toBe('a\\_b\\%c\\\\d@x.co');
  });
});

describe('audit log writes are best effort', () => {
  it('never throws, even when the service client cannot be created', async () => {
    const { recordAudit } = await import('../audit');
    await expect(recordAudit({ action: 'customer.erased', businessId: B })).resolves.toBeUndefined();
  });
});
