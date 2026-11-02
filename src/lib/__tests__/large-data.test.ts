/** @jest-environment node */
import { MiniDb } from './helpers/mini-db';
import { evaluateSegment } from '../segments';
import { computeRevenueAttribution } from '../health';

const B = 'biz-1';
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('queries past the 1000-row response cap', () => {
  it('segments see every customer and visit, not just the first 1000', async () => {
    const db = new MiniDb();
    for (let i = 0; i < 1500; i++) {
      const id = `c${String(i).padStart(4, '0')}`;
      db.rows('customers').push({ id, business_id: B, name: id });
      db.rows('visits').push({ id: `v${String(i).padStart(4, '0')}`, business_id: B, customer_id: id, visited_at: daysAgo(90), price: 50 });
    }
    const members = await evaluateSegment(db as never, B, [{ field: 'days_since_last_visit', operator: 'gte', value: 60 }]);
    expect(members).toHaveLength(1500);
  });

  it('revenue attribution counts clicks and visits beyond 1000 rows', async () => {
    const db = new MiniDb();
    for (let i = 0; i < 1200; i++) {
      const cid = `c${String(i).padStart(4, '0')}`;
      const mid = `m${String(i).padStart(4, '0')}`;
      db.rows('messages').push({ id: mid, business_id: B, purpose: 'rebooking_reminder' });
      db.rows('interaction_events').push({ id: `e${String(i).padStart(4, '0')}`, business_id: B, event_type: 'click', customer_id: cid, message_id: mid, occurred_at: daysAgo(3) });
      db.rows('visits').push({ id: `v${String(i).padStart(4, '0')}`, business_id: B, customer_id: cid, visited_at: daysAgo(2), price: 10 });
    }
    const r = await computeRevenueAttribution(db as never, B);
    expect(r).toEqual({ totalAttributed: 12000, attributedVisitCount: 1200 });
  });
});
