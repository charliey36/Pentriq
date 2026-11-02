/**
 * Segmentation rule evaluator. A segment's rule_definition is a list of conditions, ANDed together, evaluated
 * live against each customer's computed attributes rather than stored as a static member list, so membership
 * always reflects current data.
 *
 * Fields cover the questions owners actually ask ("who is due to rebook?", "who are my VIPs?", "who hasn't
 * been back in two months?"). `rebooking_status` uses exactly the same due/lapsed definition as the rebooking
 * reminders (computeRebookingStatus), so a segment and the reminder job never disagree about who is lapsed.
 * Archived customers are never members.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Customer, Visit } from '@/lib/database.types';
import { computeLifetimeValue, computeRebookingStatus } from '@/lib/visits';
import { fetchAll } from '@/lib/fetch-all';

export type SegmentField =
  | 'days_since_last_visit'
  | 'lifetime_value'
  | 'visit_count'
  | 'tag'
  | 'rebooking_status'
  | 'email_status'
  | 'days_since_added'
  | 'average_spend';
export type SegmentOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
export type SegmentCondition = { field: SegmentField; operator: SegmentOperator; value: string | number };

const NUMERIC_OPERATORS: SegmentOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq'];

export type FieldSpec = {
  label: string;
  kind: 'number' | 'enum' | 'text';
  operators: SegmentOperator[];
  unit?: 'days' | 'gbp' | 'visits';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export const SEGMENT_FIELDS: Record<SegmentField, FieldSpec> = {
  days_since_last_visit: { label: 'Days since last visit', kind: 'number', operators: NUMERIC_OPERATORS, unit: 'days', placeholder: '60' },
  lifetime_value: { label: 'Lifetime value', kind: 'number', operators: NUMERIC_OPERATORS, unit: 'gbp', placeholder: '200' },
  average_spend: { label: 'Average spend per visit', kind: 'number', operators: NUMERIC_OPERATORS, unit: 'gbp', placeholder: '40' },
  visit_count: { label: 'Number of visits', kind: 'number', operators: NUMERIC_OPERATORS, unit: 'visits', placeholder: '3' },
  days_since_added: { label: 'Days since added', kind: 'number', operators: NUMERIC_OPERATORS, unit: 'days', placeholder: '30' },
  rebooking_status: {
    label: 'Rebooking status',
    kind: 'enum',
    operators: ['eq'],
    options: [
      { value: 'due', label: 'Due to rebook' },
      { value: 'lapsed', label: 'Lapsed' },
      { value: 'on_track', label: 'On track' },
      { value: 'unknown', label: 'No rebooking interval' },
    ],
  },
  email_status: {
    label: 'Email status',
    kind: 'enum',
    operators: ['eq'],
    options: [
      { value: 'subscribed', label: 'Subscribed' },
      { value: 'unsubscribed', label: 'Unsubscribed' },
    ],
  },
  tag: { label: 'Tag', kind: 'text', operators: ['eq'], placeholder: 'vip' },
};

export const OPERATOR_LABELS: Record<SegmentOperator, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' };

export const MAX_CONDITIONS = 5;

export type RebookingState = 'due' | 'lapsed' | 'on_track' | 'unknown';

export type CustomerMetrics = {
  customer: Customer;
  daysSinceLastVisit: number | null;
  daysSinceAdded: number;
  lastVisitAt: string | null;
  lifetimeValue: number;
  averageSpend: number | null;
  visitCount: number;
  tags: string[];
  rebooking: RebookingState;
  subscribed: boolean;
};

function compare(actual: number, operator: SegmentOperator, expected: number): boolean {
  switch (operator) {
    case 'gt':
      return actual > expected;
    case 'lt':
      return actual < expected;
    case 'gte':
      return actual >= expected;
    case 'lte':
      return actual <= expected;
    case 'eq':
      return actual === expected;
  }
}

export function matchesCondition(metrics: CustomerMetrics, condition: SegmentCondition): boolean {
  switch (condition.field) {
    case 'tag':
      return metrics.tags.includes(String(condition.value).trim().toLowerCase());
    case 'rebooking_status':
      return metrics.rebooking === String(condition.value);
    case 'email_status':
      return String(condition.value) === (metrics.subscribed ? 'subscribed' : 'unsubscribed');
    default: {
      const expected = Number(condition.value);
      if (!Number.isFinite(expected)) return false;
      const actual =
        condition.field === 'days_since_last_visit' ? metrics.daysSinceLastVisit
          : condition.field === 'lifetime_value' ? metrics.lifetimeValue
            : condition.field === 'visit_count' ? metrics.visitCount
              : condition.field === 'days_since_added' ? metrics.daysSinceAdded
                : condition.field === 'average_spend' ? metrics.averageSpend
                  : null;
      if (actual === null) return false;
      return compare(actual, condition.operator, expected);
    }
  }
}

export type SegmentInputs = {
  customers: Customer[];
  visits: { customer_id: string; visited_at: string; price: number | null; service_id?: string | null }[];
  tags: { customer_id: string; tag: string }[];
  /** Service rebooking intervals, used for `rebooking_status`. Optional for older callers. */
  services?: { id: string; recurrence_interval_days: number | null }[];
};

/** Loads everything segment rules need, once, with paging past the 1000-row response cap. */
export async function loadSegmentInputs(supabase: SupabaseClient<Database>, businessId: string): Promise<SegmentInputs> {
  const [customers, visits, tags, services] = await Promise.all([
    fetchAll((from, to) => supabase.from('customers').select('*').eq('business_id', businessId).order('id').range(from, to)),
    fetchAll((from, to) => supabase.from('visits').select('customer_id, visited_at, price, service_id').eq('business_id', businessId).order('id').range(from, to)),
    fetchAll((from, to) => supabase.from('customer_tags').select('customer_id, tag').eq('business_id', businessId).order('customer_id').order('tag').range(from, to)).catch(() => []),
    fetchAll((from, to) => supabase.from('services').select('id, recurrence_interval_days').eq('business_id', businessId).order('id').range(from, to)).catch(() => []),
  ]);
  return { customers, visits, tags, services };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Per-customer attributes for every non-archived customer. Pure: pass `now` for deterministic tests. */
export function computeCustomerMetrics(inputs: SegmentInputs, now: number = Date.now()): CustomerMetrics[] {
  const visitsByCustomer = new Map<string, SegmentInputs['visits']>();
  for (const visit of inputs.visits) {
    const list = visitsByCustomer.get(visit.customer_id) ?? [];
    list.push(visit);
    visitsByCustomer.set(visit.customer_id, list);
  }
  const tagsByCustomer = new Map<string, string[]>();
  for (const tag of inputs.tags) {
    const list = tagsByCustomer.get(tag.customer_id) ?? [];
    list.push(tag.tag.trim().toLowerCase());
    tagsByCustomer.set(tag.customer_id, list);
  }
  const intervalByService = new Map((inputs.services ?? []).map((s) => [s.id, s.recurrence_interval_days]));

  return inputs.customers
    .filter((customer) => !customer.archived_at)
    .map((customer) => {
      const customerVisits = visitsByCustomer.get(customer.id) ?? [];
      const mostRecent = customerVisits
        .slice()
        .sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime())[0];
      const lifetimeValue = computeLifetimeValue(customerVisits);
      const priced = customerVisits.filter((v) => typeof v.price === 'number' && v.price > 0);

      let rebooking: RebookingState = 'unknown';
      const interval = mostRecent?.service_id ? intervalByService.get(mostRecent.service_id) ?? null : null;
      if (mostRecent && interval) {
        // Same definition the reminder job uses; it only reads the latest visit's date.
        const status = computeRebookingStatus([mostRecent as unknown as Visit], interval);
        rebooking = status.isLapsed ? 'lapsed' : status.isDue ? 'due' : 'on_track';
      }

      return {
        customer,
        daysSinceLastVisit: mostRecent ? Math.floor((now - new Date(mostRecent.visited_at).getTime()) / DAY_MS) : null,
        daysSinceAdded: Math.max(0, Math.floor((now - new Date(customer.created_at).getTime()) / DAY_MS)) || 0,
        lastVisitAt: mostRecent?.visited_at ?? null,
        lifetimeValue,
        averageSpend: priced.length ? Math.round((priced.reduce((s, v) => s + (v.price as number), 0) / priced.length) * 100) / 100 : null,
        visitCount: customerVisits.length,
        tags: tagsByCustomer.get(customer.id) ?? [],
        rebooking,
        subscribed: !customer.unsubscribed_at,
      };
    });
}

export function filterMetrics(metrics: CustomerMetrics[], conditions: SegmentCondition[]): CustomerMetrics[] {
  return metrics.filter((m) => conditions.every((condition) => matchesCondition(m, condition)));
}

/** Pass `inputs` when evaluating several segments so the data is loaded once, not once per segment. */
export async function evaluateSegment(
  supabase: SupabaseClient<Database>,
  businessId: string,
  conditions: SegmentCondition[],
  inputs?: SegmentInputs
): Promise<Customer[]> {
  const data = inputs ?? (await loadSegmentInputs(supabase, businessId));
  return filterMetrics(computeCustomerMetrics(data), conditions).map((m) => m.customer);
}

export type ValidationResult = { ok: true; conditions: SegmentCondition[] } | { ok: false; error: string };

/** Strict validation of rules coming from a form, URL or API: known fields, allowed operators, sane values. */
export function validateConditions(input: unknown): ValidationResult {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'Add at least one condition.' };
  if (input.length > MAX_CONDITIONS) return { ok: false, error: `A segment can have up to ${MAX_CONDITIONS} conditions.` };
  const conditions: SegmentCondition[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid condition.' };
    const { field, operator, value } = raw as Record<string, unknown>;
    if (typeof field !== 'string' || !(field in SEGMENT_FIELDS)) return { ok: false, error: 'Unknown field.' };
    const spec = SEGMENT_FIELDS[field as SegmentField];
    if (typeof operator !== 'string' || !spec.operators.includes(operator as SegmentOperator)) {
      return { ok: false, error: `That comparison isn't available for ${spec.label.toLowerCase()}.` };
    }
    const text = String(value ?? '').trim();
    if (!text) return { ok: false, error: `Enter a value for ${spec.label.toLowerCase()}.` };
    if (spec.kind === 'number') {
      const n = Number(text.replace(/^£/, ''));
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { ok: false, error: `${spec.label} must be a positive number.` };
      conditions.push({ field: field as SegmentField, operator: operator as SegmentOperator, value: n });
    } else if (spec.kind === 'enum') {
      if (!spec.options?.some((o) => o.value === text)) return { ok: false, error: `Choose a valid ${spec.label.toLowerCase()}.` };
      conditions.push({ field: field as SegmentField, operator: 'eq', value: text });
    } else {
      if (text.length > 40) return { ok: false, error: 'Tags must be 40 characters or fewer.' };
      conditions.push({ field: field as SegmentField, operator: 'eq', value: text.toLowerCase() });
    }
  }
  return { ok: true, conditions };
}

/**
 * Rules saved by the earlier single-condition form: the operator dropdown applied to every field (so a tag
 * rule could be stored as "tag gte vip", which always matched on the tag regardless). Coerce those to "eq"
 * before validating so existing segments keep their meaning.
 */
export function normaliseStoredConditions(input: unknown): ValidationResult {
  if (!Array.isArray(input)) return validateConditions(input);
  const fixed = input.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const c = raw as Record<string, unknown>;
    const spec = typeof c.field === 'string' ? SEGMENT_FIELDS[c.field as SegmentField] : undefined;
    return spec && spec.kind !== 'number' ? { ...c, operator: 'eq' } : c;
  });
  return validateConditions(fixed);
}

export function describeCondition(condition: SegmentCondition): string {
  const spec = SEGMENT_FIELDS[condition.field];
  if (!spec) return 'Unknown rule';
  if (spec.kind === 'enum') {
    const option = spec.options?.find((o) => o.value === String(condition.value));
    return `${spec.label}: ${option?.label ?? condition.value}`;
  }
  if (spec.kind === 'text') return `Tagged “${condition.value}”`;
  const value = spec.unit === 'gbp' ? `£${Number(condition.value).toLocaleString('en-GB')}` : Number(condition.value).toLocaleString('en-GB');
  const suffix = spec.unit === 'days' ? ' days' : '';
  return `${spec.label} ${OPERATOR_LABELS[condition.operator]} ${value}${suffix}`;
}

export type SegmentPreset = { key: string; name: string; description: string; conditions: SegmentCondition[] };

/** One-click starting points for the segments people build most. */
export const SEGMENT_PRESETS: SegmentPreset[] = [
  { key: 'due', name: 'Due to rebook', description: 'Within a week of (or past) their usual rebooking date.', conditions: [{ field: 'rebooking_status', operator: 'eq', value: 'due' }] },
  { key: 'lapsed', name: 'Lapsed customers', description: 'More than twice their rebooking interval without a visit.', conditions: [{ field: 'rebooking_status', operator: 'eq', value: 'lapsed' }] },
  { key: 'vip', name: 'VIPs', description: 'Lifetime spend of £500 or more.', conditions: [{ field: 'lifetime_value', operator: 'gte', value: 500 }] },
  { key: 'regulars', name: 'Loyal regulars', description: 'Five or more visits.', conditions: [{ field: 'visit_count', operator: 'gte', value: 5 }] },
  { key: 'one-and-done', name: 'One-time visitors', description: 'Visited once, more than 60 days ago.', conditions: [{ field: 'visit_count', operator: 'eq', value: 1 }, { field: 'days_since_last_visit', operator: 'gt', value: 60 }] },
  { key: 'new', name: 'New this month', description: 'Added in the last 30 days.', conditions: [{ field: 'days_since_added', operator: 'lte', value: 30 }] },
  { key: 'high-value-lapsed', name: 'High-value at risk', description: 'Spent £200+ but not seen for 60+ days.', conditions: [{ field: 'lifetime_value', operator: 'gte', value: 200 }, { field: 'days_since_last_visit', operator: 'gte', value: 60 }] },
];

export function findPreset(key: string | null | undefined): SegmentPreset | null {
  return SEGMENT_PRESETS.find((p) => p.key === key) ?? null;
}

/** Compact URL encoding for previewing rules (e.g. from a natural-language search): field:op:value,... */
export function encodeRules(conditions: SegmentCondition[]): string {
  return conditions.map((c) => `${c.field}:${c.operator}:${encodeURIComponent(String(c.value))}`).join(',');
}

export function decodeRules(param: string | null | undefined): SegmentCondition[] | null {
  if (!param) return null;
  const parts = param.split(',').slice(0, MAX_CONDITIONS).map((chunk) => {
    const [field, operator, ...rest] = chunk.split(':');
    let value = rest.join(':');
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    return { field, operator, value };
  });
  const result = validateConditions(parts);
  return result.ok ? result.conditions : null;
}
