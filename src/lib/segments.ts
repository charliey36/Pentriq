/**
 * Segmentation rule evaluator (D1). A segment's rule_definition is a list
 * of conditions, ANDed together, evaluated live against each customer's
 * computed attributes rather than stored as a static member list — so
 * membership always reflects current data.
 *
 * Supported fields deliberately kept small (the set the spec's example
 * rule needs: "customers who haven't visited in 60+ days with lifetime
 * spend over £200") rather than a general-purpose query language, since a
 * full query builder is explicitly a "Could Have" / later-phase item.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Customer } from '@/lib/database.types';
import { computeLifetimeValue } from '@/lib/visits';
import { fetchAll } from '@/lib/fetch-all';

export type SegmentField = 'days_since_last_visit' | 'lifetime_value' | 'visit_count' | 'tag';
export type SegmentOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
export type SegmentCondition = { field: SegmentField; operator: SegmentOperator; value: string | number };

type CustomerMetrics = {
  customer: Customer;
  daysSinceLastVisit: number | null;
  lifetimeValue: number;
  visitCount: number;
  tags: string[];
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

function matchesCondition(metrics: CustomerMetrics, condition: SegmentCondition): boolean {
  if (condition.field === 'tag') {
    return metrics.tags.includes(String(condition.value).toLowerCase());
  }

  const expected = Number(condition.value);
  let actual: number | null = null;

  if (condition.field === 'days_since_last_visit') actual = metrics.daysSinceLastVisit;
  if (condition.field === 'lifetime_value') actual = metrics.lifetimeValue;
  if (condition.field === 'visit_count') actual = metrics.visitCount;

  if (actual === null) return false;
  return compare(actual, condition.operator, expected);
}

/**
 * Loads every customer for a business along with the metrics needed to
 * evaluate segment conditions, then filters by the given rule set (ANDed).
 * Fine for SMB-scale data volumes; would need to move to a SQL-level
 * query (or a materialized rollup) before this approach stops scaling.
 */
export type SegmentInputs = {
  customers: Customer[];
  visits: { customer_id: string; visited_at: string; price: number | null }[];
  tags: { customer_id: string; tag: string }[];
};

/** Loads everything segment rules need, once, with paging past the 1000-row response cap. */
export async function loadSegmentInputs(supabase: SupabaseClient<Database>, businessId: string): Promise<SegmentInputs> {
  const [customers, visits, tags] = await Promise.all([
    fetchAll((from, to) => supabase.from('customers').select('*').eq('business_id', businessId).order('id').range(from, to)),
    fetchAll((from, to) => supabase.from('visits').select('customer_id, visited_at, price').eq('business_id', businessId).order('id').range(from, to)),
    fetchAll((from, to) => supabase.from('customer_tags').select('customer_id, tag').eq('business_id', businessId).order('customer_id').order('tag').range(from, to)).catch(() => []),
  ]);
  return { customers, visits, tags };
}

/** Pass `inputs` when evaluating several segments so the data is loaded once, not once per segment. */
export async function evaluateSegment(
  supabase: SupabaseClient<Database>,
  businessId: string,
  conditions: SegmentCondition[],
  inputs?: SegmentInputs
): Promise<Customer[]> {
  const { customers, visits, tags } = inputs ?? (await loadSegmentInputs(supabase, businessId));

  const visitsByCustomer = new Map<string, { visited_at: string; price: number | null }[]>();
  for (const visit of visits) {
    const list = visitsByCustomer.get(visit.customer_id) ?? [];
    list.push(visit);
    visitsByCustomer.set(visit.customer_id, list);
  }

  const tagsByCustomer = new Map<string, string[]>();
  for (const tag of tags) {
    const list = tagsByCustomer.get(tag.customer_id) ?? [];
    list.push(tag.tag);
    tagsByCustomer.set(tag.customer_id, list);
  }

  const now = Date.now();

  const metricsList: CustomerMetrics[] = customers.map((customer) => {
    const customerVisits = visitsByCustomer.get(customer.id) ?? [];
    const mostRecent = customerVisits
      .slice()
      .sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime())[0];

    return {
      customer,
      daysSinceLastVisit: mostRecent
        ? Math.floor((now - new Date(mostRecent.visited_at).getTime()) / (24 * 60 * 60 * 1000))
        : null,
      lifetimeValue: computeLifetimeValue(customerVisits),
      visitCount: customerVisits.length,
      tags: tagsByCustomer.get(customer.id) ?? [],
    };
  });

  return metricsList
    .filter((metrics) => conditions.every((condition) => matchesCondition(metrics, condition)))
    .map((metrics) => metrics.customer);
}
