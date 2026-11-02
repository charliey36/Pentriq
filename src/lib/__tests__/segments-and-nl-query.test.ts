/** @jest-environment node */
import {
  SEGMENT_PRESETS,
  computeCustomerMetrics,
  decodeRules,
  describeCondition,
  encodeRules,
  filterMetrics,
  findPreset,
  validateConditions,
  type SegmentInputs,
} from '../segments';
import { parseCustomerQuery } from '../intelligence/nl-query';
import type { Customer } from '../database.types';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function customer(id: string, extra: Partial<Customer> = {}): Customer {
  return {
    id, business_id: 'b1', name: id, email: `${id}@example.com`, phone: null, date_of_birth: null, last_service_date: null,
    total_spend: 0, visit_count: 0, source: null, unsubscribed_at: null, unsubscribed_sms_at: null, created_at: daysAgo(100),
    archived_at: null, consent_confirmed_at: null, ...extra,
  };
}

const inputs: SegmentInputs = {
  customers: [
    customer('due'),
    customer('lapsed'),
    customer('fresh', { created_at: daysAgo(5) }),
    customer('vip', { unsubscribed_at: daysAgo(1) }),
    customer('archived', { archived_at: daysAgo(2) }),
  ],
  visits: [
    { customer_id: 'due', visited_at: daysAgo(26), price: 40, service_id: 's30' },
    { customer_id: 'lapsed', visited_at: daysAgo(90), price: 40, service_id: 's30' },
    { customer_id: 'vip', visited_at: daysAgo(3), price: 300, service_id: 's30' },
    { customer_id: 'vip', visited_at: daysAgo(40), price: 300, service_id: null },
    { customer_id: 'archived', visited_at: daysAgo(90), price: 40, service_id: 's30' },
  ],
  tags: [{ customer_id: 'vip', tag: 'VIP ' }],
  services: [{ id: 's30', recurrence_interval_days: 30 }],
};

describe('segments engine', () => {
  const metrics = computeCustomerMetrics(inputs, NOW);
  const ids = (conds: Parameters<typeof filterMetrics>[1]) => filterMetrics(metrics, conds).map((m) => m.customer.id).sort();

  it('excludes archived customers', () => {
    expect(metrics.map((m) => m.customer.id)).not.toContain('archived');
  });

  it('computes rebooking status with the reminder definition', () => {
    expect(ids([{ field: 'rebooking_status', operator: 'eq', value: 'due' }])).toEqual(['due']);
    expect(ids([{ field: 'rebooking_status', operator: 'eq', value: 'lapsed' }])).toEqual(['lapsed']);
    expect(ids([{ field: 'rebooking_status', operator: 'eq', value: 'unknown' }])).toEqual(['fresh']);
  });

  it('ANDs multiple conditions and normalises tags', () => {
    expect(ids([{ field: 'lifetime_value', operator: 'gte', value: 500 }, { field: 'tag', operator: 'eq', value: 'vip' }])).toEqual(['vip']);
  });

  it('supports email status, days since added and average spend', () => {
    expect(ids([{ field: 'email_status', operator: 'eq', value: 'unsubscribed' }])).toEqual(['vip']);
    expect(ids([{ field: 'days_since_added', operator: 'lte', value: 30 }])).toEqual(['fresh']);
    expect(ids([{ field: 'average_spend', operator: 'gt', value: 100 }])).toEqual(['vip']);
  });

  it('validates rules strictly', () => {
    expect(validateConditions([])).toMatchObject({ ok: false });
    expect(validateConditions([{ field: 'nope', operator: 'eq', value: 1 }])).toMatchObject({ ok: false, error: 'Unknown field.' });
    expect(validateConditions([{ field: 'tag', operator: 'gt', value: 'x' }])).toMatchObject({ ok: false });
    expect(validateConditions([{ field: 'lifetime_value', operator: 'gt', value: 'abc' }])).toMatchObject({ ok: false });
    expect(validateConditions([{ field: 'rebooking_status', operator: 'eq', value: 'sometime' }])).toMatchObject({ ok: false });
    expect(validateConditions(Array(6).fill({ field: 'visit_count', operator: 'gt', value: 1 }))).toMatchObject({ ok: false });
    expect(validateConditions([{ field: 'lifetime_value', operator: 'gt', value: '£250' }])).toEqual({
      ok: true,
      conditions: [{ field: 'lifetime_value', operator: 'gt', value: 250 }],
    });
  });

  it('round-trips rules through the URL encoding and rejects tampering', () => {
    const rules = [{ field: 'days_since_last_visit' as const, operator: 'gte' as const, value: 60 }, { field: 'tag' as const, operator: 'eq' as const, value: 'a,b:c' }];
    expect(decodeRules(encodeRules(rules))).toEqual(rules);
    expect(decodeRules('evil:drop:1')).toBeNull();
    expect(decodeRules('')).toBeNull();
  });

  it('describes conditions in plain English', () => {
    expect(describeCondition({ field: 'lifetime_value', operator: 'gte', value: 500 })).toBe('Lifetime value ≥ £500');
    expect(describeCondition({ field: 'days_since_last_visit', operator: 'gt', value: 60 })).toBe('Days since last visit > 60 days');
    expect(describeCondition({ field: 'rebooking_status', operator: 'eq', value: 'due' })).toBe('Rebooking status: Due to rebook');
  });

  it('ships valid presets', () => {
    for (const preset of SEGMENT_PRESETS) expect(validateConditions(preset.conditions).ok).toBe(true);
    expect(findPreset('due')?.name).toBe('Due to rebook');
    expect(findPreset('nope')).toBeNull();
  });
});

describe('Ask Pentriq natural-language queries', () => {
  const rules = (q: string) => {
    const r = parseCustomerQuery(q);
    return r?.kind === 'segment' ? r.conditions : r;
  };

  it('parses recency and spend together', () => {
    expect(rules("customers who haven't visited in 2 months and spent over £200")).toEqual([
      { field: 'days_since_last_visit', operator: 'gte', value: 60 },
      { field: 'lifetime_value', operator: 'gt', value: 200 },
    ]);
  });

  it('parses visit counts and tags', () => {
    expect(rules('vip tagged customers with more than 5 visits')).toEqual([
      { field: 'visit_count', operator: 'gt', value: 5 },
      { field: 'tag', operator: 'eq', value: 'vip' },
    ]);
    expect(rules('5+ visits')).toEqual([{ field: 'visit_count', operator: 'gte', value: 5 }]);
    expect(rules('#newsletter')).toEqual([{ field: 'tag', operator: 'eq', value: 'newsletter' }]);
  });

  it('understands lifecycle words', () => {
    expect(rules('who is due to rebook?')).toEqual([{ field: 'rebooking_status', operator: 'eq', value: 'due' }]);
    expect(rules('lapsed big spenders')).toEqual([
      { field: 'rebooking_status', operator: 'eq', value: 'lapsed' },
      { field: 'lifetime_value', operator: 'gte', value: 500 },
    ]);
    expect(rules('new customers this month')).toEqual([{ field: 'days_since_added', operator: 'lte', value: 30 }]);
    expect(rules('visited in the last 3 weeks')).toEqual([{ field: 'days_since_last_visit', operator: 'lte', value: 21 }]);
    expect(rules('average spend over £1k')).toEqual([{ field: 'average_spend', operator: 'gt', value: 1000 }]);
  });

  it('routes review-request status questions to the customers list', () => {
    expect(parseCustomerQuery('failed review requests')).toMatchObject({ kind: 'customers', status: 'failed', href: '/customers?status=failed' });
    expect(parseCustomerQuery('customers never asked for a review')).toMatchObject({ kind: 'customers', status: 'none' });
  });

  it('builds a segments preview link', () => {
    const r = parseCustomerQuery('spent over £200');
    expect(r?.href).toBe(`/segments?rules=${encodeURIComponent('lifetime_value:gt:200')}`);
    expect(r?.summary).toBe('Lifetime value > £200');
  });

  it('returns null for things it does not understand', () => {
    expect(parseCustomerQuery('settings')).toBeNull();
    expect(parseCustomerQuery('hi')).toBeNull();
    expect(parseCustomerQuery('jane smith')).toBeNull();
  });
});

describe('legacy stored segments', () => {
  it('keeps old single-condition rules working', () => {
    const { normaliseStoredConditions } = jest.requireActual('../segments') as typeof import('../segments');
    expect(normaliseStoredConditions([{ field: 'tag', operator: 'gte', value: 'VIP' }])).toEqual({ ok: true, conditions: [{ field: 'tag', operator: 'eq', value: 'vip' }] });
    expect(normaliseStoredConditions([{ field: 'days_since_last_visit', operator: 'gte', value: '60' }])).toEqual({ ok: true, conditions: [{ field: 'days_since_last_visit', operator: 'gte', value: 60 }] });
    expect(normaliseStoredConditions('nonsense')).toMatchObject({ ok: false });
  });
});
