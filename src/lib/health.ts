/**
 * Heuristic customer health scoring (F1) and business-level rebooking-rate /
 * revenue-attribution calculations (E2/E3). Deliberately simple, explainable
 * formulas (classic RFM — recency/frequency/monetary) rather than an opaque
 * ML model, per the spec's explicit guidance to favor heuristics the
 * business owner can understand over black-box predictions, especially
 * before enough data volume exists to validate a real model (F2/F3 are
 * scoped as later-phase work in the spec for exactly this reason).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Visit } from '@/lib/database.types';
import { computeLifetimeValue } from '@/lib/visits';
import { chunkIds, fetchAll } from '@/lib/fetch-all';

export type HealthScore = {
  score: number; // 0-100
  tier: 'thriving' | 'steady' | 'at_risk' | 'lapsed';
  factors: { recency: number; frequency: number; monetary: number };
};

/**
 * Simple min-max-normalized RFM blend. Recency is inverted (fewer days
 * since last visit = higher score). All three factors weighted equally —
 * a reasonable default with no data yet to justify different weights.
 */
export function computeHealthScore(
  visits: Pick<Visit, 'visited_at' | 'price'>[],
  recurrenceIntervalDays: number | null
): HealthScore {
  if (visits.length === 0) {
    return { score: 0, tier: 'lapsed', factors: { recency: 0, frequency: 0, monetary: 0 } };
  }

  const sorted = [...visits].sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime());
  const daysSinceLastVisit = Math.floor((Date.now() - new Date(sorted[0].visited_at).getTime()) / (24 * 60 * 60 * 1000));

  const interval = recurrenceIntervalDays ?? 60;
  const recency = Math.max(0, Math.min(100, 100 - (daysSinceLastVisit / (interval * 2)) * 100));

  const frequency = Math.max(0, Math.min(100, (visits.length / 10) * 100));

  const lifetimeValue = computeLifetimeValue(visits);
  const monetary = Math.max(0, Math.min(100, (lifetimeValue / 500) * 100));

  const score = Math.round((recency + frequency + monetary) / 3);

  let tier: HealthScore['tier'] = 'steady';
  if (daysSinceLastVisit > interval * 2) tier = 'lapsed';
  else if (score >= 70) tier = 'thriving';
  else if (score < 40) tier = 'at_risk';

  return { score, tier, factors: { recency: Math.round(recency), frequency: Math.round(frequency), monetary: Math.round(monetary) } };
}

export type RebookingRateResult = { rate: number | null; completedVisits: number; rebookedWithin30Days: number };

/**
 * Rebooking rate = (visits followed by another visit from the same
 * customer within 30 days) / (total visits), the industry-standard framing
 * cited across the beauty/wellness research (Phorest, Zenoti, GlossGenius
 * all headline a rebooking %). Returns null rate when there isn't enough
 * visit history yet, rather than a misleading 0%.
 */
export function computeRebookingRate(visits: Pick<Visit, 'customer_id' | 'visited_at'>[]): RebookingRateResult {
  if (visits.length === 0) {
    return { rate: null, completedVisits: 0, rebookedWithin30Days: 0 };
  }

  const byCustomer = new Map<string, Date[]>();
  for (const visit of visits) {
    const list = byCustomer.get(visit.customer_id) ?? [];
    list.push(new Date(visit.visited_at));
    byCustomer.set(visit.customer_id, list);
  }

  let completedVisits = 0;
  let rebookedWithin30Days = 0;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (const dates of byCustomer.values()) {
    const sorted = dates.slice().sort((a, b) => a.getTime() - b.getTime());
    for (let i = 0; i < sorted.length; i++) {
      completedVisits += 1;
      const next = sorted[i + 1];
      if (next && next.getTime() - sorted[i].getTime() <= thirtyDaysMs) {
        rebookedWithin30Days += 1;
      }
    }
  }

  if (completedVisits === 0) {
    return { rate: null, completedVisits: 0, rebookedWithin30Days: 0 };
  }

  return {
    rate: Math.round((rebookedWithin30Days / completedVisits) * 1000) / 10,
    completedVisits,
    rebookedWithin30Days,
  };
}

/**
 * Revenue attribution (E3): sums visit revenue that occurred within 7 days
 * of a customer clicking a rebooking_reminder message, as a simple
 * last-touch attribution window. Documented as a reasonable estimate, not
 * perfect ground truth — a visit in that window could have happened
 * anyway.
 */
export async function computeRevenueAttribution(
  supabase: SupabaseClient<Database>,
  businessId: string
): Promise<{ totalAttributed: number; attributedVisitCount: number }> {
  // Paged reads: a single query is silently capped at 1000 rows, which would understate revenue.
  const clicks = await fetchAll((from, to) =>
    supabase.from('interaction_events').select('customer_id, occurred_at, message_id').eq('business_id', businessId).eq('event_type', 'click').order('id').range(from, to)
  );

  const messageIds = [...new Set(clicks.map((c) => c.message_id).filter(Boolean))] as string[];
  const rebookingMessages: Array<{ id: string }> = [];
  for (const chunk of chunkIds(messageIds, 100)) {
    const { data } = await supabase.from('messages').select('id').in('id', chunk).eq('purpose', 'rebooking_reminder');
    rebookingMessages.push(...(data ?? []));
  }

  const rebookingMessageIds = new Set(rebookingMessages.map((m) => m.id));
  const rebookingClicks = clicks.filter((c) => c.message_id && rebookingMessageIds.has(c.message_id));

  if (rebookingClicks.length === 0) {
    return { totalAttributed: 0, attributedVisitCount: 0 };
  }

  const visits = await fetchAll((from, to) =>
    supabase.from('visits').select('customer_id, visited_at, price').eq('business_id', businessId).order('id').range(from, to)
  );

  const visitsByCustomer = new Map<string, typeof visits>();
  for (const v of visits) {
    const list = visitsByCustomer.get(v.customer_id);
    if (list) list.push(v);
    else visitsByCustomer.set(v.customer_id, [v]);
  }

  let totalAttributed = 0;
  let attributedVisitCount = 0;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  for (const click of rebookingClicks) {
    if (!click.customer_id) continue;
    const clickTime = new Date(click.occurred_at).getTime();

    const matchingVisit = (visitsByCustomer.get(click.customer_id) ?? []).find(
      (v) =>
        new Date(v.visited_at).getTime() >= clickTime &&
        new Date(v.visited_at).getTime() - clickTime <= sevenDaysMs
    );

    if (matchingVisit?.price) {
      totalAttributed += matchingVisit.price;
      attributedVisitCount += 1;
    }
  }

  return { totalAttributed, attributedVisitCount };
}
