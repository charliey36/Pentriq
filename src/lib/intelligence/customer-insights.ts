/**
 * Customer intelligence: a one-glance read of a single customer for the detail page.
 *
 * Learns each customer's own visit rhythm (median gap between visits) and falls back to the service's
 * rebooking interval only when there isn't enough personal history. From that it predicts the next visit,
 * rates churn risk with the reasons behind it, and recommends the next action. Everything is computed from
 * the business's own records; nothing is sent to a third party.
 */

const DAY_MS = 86_400_000;

export type InsightVisit = { visited_at: string; price: number | null; service_id: string | null };
export type InsightService = { id: string; name: string; recurrence_interval_days: number | null };

export type CustomerInsightInput = {
  name: string;
  createdAt: string;
  visits: InsightVisit[];
  services: InsightService[];
  unsubscribed: boolean;
  archived: boolean;
  /** Latest private feedback rating (1-5) if any. */
  lastFeedbackRating?: number | null;
  /** When the last review request or reminder was sent. */
  lastContactedAt?: string | null;
  /** Has this customer ever clicked a review link? */
  hasClickedReview?: boolean;
  loyaltyBalance?: number | null;
  loyaltyRedemptionPoints?: number | null;
  now?: Date;
};

export type ChurnRisk = 'new' | 'low' | 'medium' | 'high' | 'lapsed' | 'unknown';

export type RecommendedAction = {
  id: 'log_visit' | 'send_rebooking' | 'send_review' | 'win_back' | 'reward' | 'follow_up_feedback' | 'resubscribe_note';
  label: string;
  detail: string;
};

export type CustomerInsight = {
  headline: string;
  narrative: string[];
  churnRisk: ChurnRisk;
  /** 0 (safe) to 100 (gone). */
  churnScore: number;
  churnReasons: string[];
  cadenceDays: number | null;
  cadenceBasis: 'personal' | 'service' | null;
  daysSinceLastVisit: number | null;
  predictedNextVisit: Date | null;
  favouriteService: string | null;
  averageSpend: number | null;
  spendTrend: 'up' | 'down' | 'flat' | null;
  visitsLast12Months: number;
  actions: RecommendedAction[];
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Gaps in whole days between consecutive visits (oldest first). */
export function visitGaps(visits: Pick<InsightVisit, 'visited_at'>[]): number[] {
  const times = visits.map((v) => new Date(v.visited_at).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const gap = Math.round((times[i] - times[i - 1]) / DAY_MS);
    if (gap > 0) gaps.push(gap);
  }
  return gaps;
}

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: n % 1 === 0 ? 0 : 2, minimumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;

function churnFromRatio(ratio: number): { risk: ChurnRisk; score: number } {
  // ratio = days since last visit / usual gap. 1.0 = exactly on schedule.
  const score = Math.round(Math.max(0, Math.min(100, (ratio - 0.6) * 55)));
  if (ratio > 2) return { risk: 'lapsed', score: Math.max(score, 85) };
  if (ratio > 1.4) return { risk: 'high', score };
  if (ratio > 1.0) return { risk: 'medium', score };
  return { risk: 'low', score };
}

export function analyseCustomer(input: CustomerInsightInput): CustomerInsight {
  const now = input.now ?? new Date();
  const first = input.name.trim().split(/\s+/)[0] || 'This customer';
  const visits = [...input.visits]
    .filter((v) => Number.isFinite(new Date(v.visited_at).getTime()))
    .sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime());
  const servicesById = new Map(input.services.map((s) => [s.id, s]));

  // Favourite service: most frequent, ties broken by most recent use.
  const serviceCounts = new Map<string, number>();
  for (const v of visits) if (v.service_id) serviceCounts.set(v.service_id, (serviceCounts.get(v.service_id) ?? 0) + 1);
  const favouriteId = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const favouriteService = favouriteId ? servicesById.get(favouriteId)?.name ?? null : null;

  const priced = visits.filter((v) => typeof v.price === 'number' && v.price > 0).map((v) => v.price as number);
  const averageSpend = priced.length ? Math.round((priced.reduce((s, p) => s + p, 0) / priced.length) * 100) / 100 : null;
  let spendTrend: CustomerInsight['spendTrend'] = null;
  if (priced.length >= 4) {
    // `priced` is newest first: compare the newer half with the older half.
    const half = Math.floor(priced.length / 2);
    const recent = priced.slice(0, half).reduce((s, p) => s + p, 0) / half;
    const older = priced.slice(half).reduce((s, p) => s + p, 0) / (priced.length - half);
    const change = older > 0 ? (recent - older) / older : 0;
    spendTrend = change > 0.1 ? 'up' : change < -0.1 ? 'down' : 'flat';
  }

  const gaps = visitGaps(visits);
  const personal = gaps.length >= 2 ? median(gaps) : null;
  const lastServiceInterval = visits[0]?.service_id ? servicesById.get(visits[0].service_id)?.recurrence_interval_days ?? null : null;
  const cadenceDays = personal !== null ? Math.round(personal) : lastServiceInterval;
  const cadenceBasis: CustomerInsight['cadenceBasis'] = personal !== null ? 'personal' : lastServiceInterval ? 'service' : null;

  const lastVisitAt = visits[0] ? new Date(visits[0].visited_at) : null;
  const daysSinceLastVisit = lastVisitAt ? Math.max(0, Math.floor((now.getTime() - lastVisitAt.getTime()) / DAY_MS)) : null;
  const predictedNextVisit = lastVisitAt && cadenceDays ? new Date(lastVisitAt.getTime() + cadenceDays * DAY_MS) : null;
  const visitsLast12Months = visits.filter((v) => now.getTime() - new Date(v.visited_at).getTime() <= 365 * DAY_MS).length;

  let churnRisk: ChurnRisk = 'unknown';
  let churnScore = 0;
  const churnReasons: string[] = [];
  const customerAgeDays = Math.floor((now.getTime() - new Date(input.createdAt).getTime()) / DAY_MS);

  if (visits.length === 0) {
    churnRisk = customerAgeDays <= 30 ? 'new' : 'unknown';
    churnReasons.push('No visits logged yet');
  } else if (cadenceDays && daysSinceLastVisit !== null) {
    const ratio = daysSinceLastVisit / cadenceDays;
    const r = churnFromRatio(ratio);
    churnRisk = r.risk;
    churnScore = r.score;
    churnReasons.push(
      ratio <= 1
        ? `Last visit ${daysSinceLastVisit} days ago, within their usual ${cadenceDays}-day rhythm`
        : `${daysSinceLastVisit} days since last visit, ${Math.round((ratio - 1) * 100)}% past their usual ${cadenceDays}-day rhythm`
    );
  } else if (daysSinceLastVisit !== null) {
    // One visit and no service interval: judge against a generic 90 days.
    const r = churnFromRatio(daysSinceLastVisit / 90);
    churnRisk = visits.length === 1 && daysSinceLastVisit < 45 ? 'new' : r.risk;
    churnScore = r.score;
    churnReasons.push(`${daysSinceLastVisit} days since their only visit`);
  }

  if (input.lastFeedbackRating != null && input.lastFeedbackRating <= 2) {
    churnScore = Math.min(100, churnScore + 25);
    churnReasons.push(`Left a ${input.lastFeedbackRating}★ private rating`);
    if (churnRisk === 'low' || churnRisk === 'new') churnRisk = 'medium';
  }
  if (spendTrend === 'down') churnReasons.push('Spending less per visit than before');
  if (input.unsubscribed) churnReasons.push('Unsubscribed from emails');

  const actions: RecommendedAction[] = [];
  if (input.lastFeedbackRating != null && input.lastFeedbackRating <= 2) {
    actions.push({ id: 'follow_up_feedback', label: 'Follow up their feedback', detail: 'A personal reply is the best chance of keeping them.' });
  }
  if (visits.length === 0) {
    actions.push({ id: 'log_visit', label: 'Log their first visit', detail: 'Unlocks rebooking timing, lifetime value and loyalty.' });
  }
  if (!input.unsubscribed && !input.archived) {
    if (churnRisk === 'lapsed') {
      actions.push({ id: 'win_back', label: 'Send a win-back reminder', detail: `${first} hasn't been back for over twice their usual gap.` });
    } else if (churnRisk === 'medium' || churnRisk === 'high' || (predictedNextVisit && predictedNextVisit.getTime() - now.getTime() < 7 * DAY_MS)) {
      actions.push({ id: 'send_rebooking', label: 'Send a rebooking reminder', detail: predictedNextVisit ? 'They are due about now.' : 'Prompt their next appointment.' });
    }
    if (visits.length > 0 && !input.hasClickedReview && (input.lastFeedbackRating == null || input.lastFeedbackRating >= 4)) {
      actions.push({ id: 'send_review', label: 'Ask for a Google review', detail: 'They have visited but never left a review.' });
    }
  }
  if (input.loyaltyRedemptionPoints && input.loyaltyBalance != null && input.loyaltyBalance >= input.loyaltyRedemptionPoints) {
    actions.push({ id: 'reward', label: 'Tell them about their reward', detail: `${input.loyaltyBalance} points: enough to redeem.` });
  }
  if (input.unsubscribed) {
    actions.push({ id: 'resubscribe_note', label: 'Contact in person only', detail: 'They unsubscribed, so automated emails are off.' });
  }

  // Narrative: a few short, factual sentences.
  const narrative: string[] = [];
  if (visits.length === 0) {
    narrative.push(`${first} joined ${customerAgeDays <= 1 ? 'today' : `${customerAgeDays} days ago`} and has no visits logged yet.`);
  } else {
    const ltv = priced.reduce((s, p) => s + p, 0);
    narrative.push(
      `${first} has visited ${visits.length} time${visits.length === 1 ? '' : 's'}${ltv > 0 ? `, spending ${gbp(Math.round(ltv * 100) / 100)} in total` : ''}${favouriteService ? `, usually for ${favouriteService}` : ''}.`
    );
    if (cadenceDays) {
      narrative.push(
        cadenceBasis === 'personal'
          ? `They typically come back every ${cadenceDays} days.`
          : `Based on the service interval, they should return every ${cadenceDays} days.`
      );
    }
    if (spendTrend === 'up') narrative.push('Their spend per visit is rising.');
    if (spendTrend === 'down') narrative.push('Their spend per visit has dropped recently.');
  }

  const headline =
    churnRisk === 'lapsed' ? 'Lapsed: worth a win-back'
      : churnRisk === 'high' ? 'Overdue: at risk of leaving'
        : churnRisk === 'medium' ? 'Slightly overdue'
          : churnRisk === 'low' ? 'On track'
            : churnRisk === 'new' ? 'New customer'
              : 'Not enough history yet';

  return {
    headline,
    narrative,
    churnRisk,
    churnScore,
    churnReasons,
    cadenceDays,
    cadenceBasis,
    daysSinceLastVisit,
    predictedNextVisit,
    favouriteService,
    averageSpend,
    spendTrend,
    visitsLast12Months,
    actions: actions.slice(0, 3),
  };
}
