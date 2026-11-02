/**
 * "Ask Pentriq": natural-language questions about customers, answered with a filtered view.
 *
 *   "customers who haven't visited in 2 months and spent over £200"  -> segment preview
 *   "vip tagged customers with more than 5 visits"                   -> segment preview
 *   "failed review requests"                                         -> customers list, status=failed
 *   "who is due to rebook?"                                          -> segment preview
 *
 * A deterministic grammar rather than an LLM: instant, free, private and predictable, and it always shows the
 * rules it understood so the owner can check them. Anything it cannot parse returns null and the palette falls
 * back to ordinary search.
 */
import { describeCondition, encodeRules, type SegmentCondition, type SegmentOperator } from '@/lib/segments';
import type { StatusFilter } from '@/lib/customer-list';

export type NlResult =
  | { kind: 'segment'; conditions: SegmentCondition[]; summary: string; href: string }
  | { kind: 'customers'; status: StatusFilter; summary: string; href: string };

const UNIT_DAYS: Record<string, number> = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365 };
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[£,]/g, '').trim().toLowerCase();
  if (cleaned in WORD_NUMBERS) return WORD_NUMBERS[cleaned];
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)k$/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const NUM = '(\\d+(?:\\.\\d+)?k?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)';
const MONEY = '£?\\s?(\\d[\\d,]*(?:\\.\\d+)?k?)';
const UNIT = '(days?|weeks?|months?|years?)';

function comparator(word: string): SegmentOperator | null {
  const w = word.toLowerCase().trim();
  if (/^(over|more than|above|greater than|>|exceeding)$/.test(w)) return 'gt';
  if (/^(at least|min(?:imum)?|>=|or more|\+)$/.test(w)) return 'gte';
  if (/^(under|less than|below|fewer than|<)$/.test(w)) return 'lt';
  if (/^(at most|max(?:imum)?|<=|or less|no more than)$/.test(w)) return 'lte';
  if (/^(exactly|=|only)$/.test(w)) return 'eq';
  return null;
}

const CMP = '(over|more than|above|greater than|exceeding|at least|minimum|min|under|less than|below|fewer than|at most|maximum|max|no more than|exactly|only|>=|<=|>|<|=)';

function pushUnique(list: SegmentCondition[], c: SegmentCondition) {
  if (!list.some((x) => x.field === c.field && x.operator === c.operator)) list.push(c);
}

/** Parse a question into segment rules or a customer status filter. Null when nothing was understood. */
export function parseCustomerQuery(input: string): NlResult | null {
  const q = ` ${input.toLowerCase().replace(/[’']/g, "'").replace(/[?!.]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (q.trim().length < 3) return null;

  // Review-request status questions map to the customers list filters.
  const statusRules: Array<[RegExp, StatusFilter, string]> = [
    [/\b(failed|bounced|undelivered)\b/, 'failed', 'Customers whose review request failed'],
    [/\b(on hold|held|waiting for approval|awaiting approval)\b/, 'held', 'Customers with a held review request'],
    [/\b(never (?:been )?(?:asked|requested|contacted)|not (?:yet )?(?:asked|requested)|no (?:review )?request)\b/, 'none', 'Customers never sent a review request'],
    [/\b(scheduled|pending|queued)\b/, 'pending', 'Customers with a scheduled review request'],
  ];
  for (const [pattern, status, summary] of statusRules) {
    if (pattern.test(q) && /\b(request|requests|review|reviews|asked|contacted|customers?|who)\b/.test(q)) {
      return { kind: 'customers', status, summary, href: `/customers?status=${status}` };
    }
  }

  const conditions: SegmentCondition[] = [];

  // Rebooking and lifecycle words.
  if (/\b(lapsed|churned|gone quiet|stopped coming|lost customers?)\b/.test(q)) {
    pushUnique(conditions, { field: 'rebooking_status', operator: 'eq', value: 'lapsed' });
  } else if (/\b(due (?:to|for) (?:rebook|rebooking|a visit|return)|due back|overdue)\b/.test(q)) {
    pushUnique(conditions, { field: 'rebooking_status', operator: 'eq', value: 'due' });
  }
  if (/\bunsubscribed\b/.test(q)) pushUnique(conditions, { field: 'email_status', operator: 'eq', value: 'unsubscribed' });
  else if (/\b(subscribed|can (?:email|contact))\b/.test(q)) pushUnique(conditions, { field: 'email_status', operator: 'eq', value: 'subscribed' });

  // "haven't visited in 2 months", "not been in for 60 days", "no visit for 6 weeks", "last visit over 90 days ago"
  const notVisited = q.match(new RegExp(`(?:haven't|have not|hasn't|has not|not|no|without (?:a )?)\\s*(?:been )?(?:visited|visit(?:ed)?|been in|been back|come in|came in|come back|booked|seen)\\s*(?:us )?(?:in|for|within)?\\s*(?:the )?(?:last |past )?${NUM}\\s*${UNIT}`));
  const lastVisitOver = q.match(new RegExp(`last visit(?:ed)?\\s*${CMP}?\\s*${NUM}\\s*${UNIT}\\s*ago`));
  const visitedRecently = q.match(new RegExp(`(?:visited|been in|came in|seen)\\s*(?:in|within)\\s*(?:the )?(?:last |past )?${NUM}\\s*${UNIT}`));
  if (notVisited) {
    const n = toNumber(notVisited[1]);
    if (n !== null) pushUnique(conditions, { field: 'days_since_last_visit', operator: 'gte', value: Math.round(n * UNIT_DAYS[notVisited[2]]) });
  } else if (lastVisitOver) {
    const n = toNumber(lastVisitOver[2]);
    const op = lastVisitOver[1] ? comparator(lastVisitOver[1]) ?? 'gte' : 'gte';
    if (n !== null) pushUnique(conditions, { field: 'days_since_last_visit', operator: op, value: Math.round(n * UNIT_DAYS[lastVisitOver[3]]) });
  } else if (visitedRecently && !/\bnot\b/.test(q)) {
    const n = toNumber(visitedRecently[1]);
    if (n !== null) pushUnique(conditions, { field: 'days_since_last_visit', operator: 'lte', value: Math.round(n * UNIT_DAYS[visitedRecently[2]]) });
  }

  // "added in the last 30 days", "new customers this month", "joined in the last 2 weeks"
  const added = q.match(new RegExp(`(?:added|joined|new)\\s*(?:customers? )?(?:in|within)\\s*(?:the )?(?:last |past )?${NUM}\\s*${UNIT}`));
  if (added) {
    const n = toNumber(added[1]);
    if (n !== null) pushUnique(conditions, { field: 'days_since_added', operator: 'lte', value: Math.round(n * UNIT_DAYS[added[2]]) });
  } else if (/\bnew (?:customers? )?this month\b|\bnew this month\b/.test(q)) {
    pushUnique(conditions, { field: 'days_since_added', operator: 'lte', value: 30 });
  }

  // Spend: "spent over £200", "lifetime value above 500", "ltv > 1k", "spend less than £50"
  const spend = q.match(new RegExp(`(?:spent|spend|spending|lifetime value|ltv|lifetime spend|total spend)\\s*(?:of )?${CMP}\\s*${MONEY}`));
  const spendReversed = q.match(new RegExp(`${CMP}\\s*${MONEY}\\s*(?:spent|spend|lifetime|in total)`));
  const avg = q.match(new RegExp(`(?:average|avg)\\s*(?:spend|ticket|visit value)?\\s*(?:per visit )?${CMP}\\s*${MONEY}`));
  if (avg) {
    const op = comparator(avg[1]);
    const n = toNumber(avg[2]);
    if (op && n !== null) pushUnique(conditions, { field: 'average_spend', operator: op, value: n });
  } else if (spend || spendReversed) {
    const m = (spend ?? spendReversed) as RegExpMatchArray;
    const op = comparator(m[1]);
    const n = toNumber(m[2]);
    if (op && n !== null) pushUnique(conditions, { field: 'lifetime_value', operator: op, value: n });
  } else if (/\b(vips?|big spenders|top spenders|high[- ]value)\b/.test(q) && !/\btag(?:ged)?\b/.test(q)) {
    pushUnique(conditions, { field: 'lifetime_value', operator: 'gte', value: 500 });
  }

  // Visits: "more than 5 visits", "at least 3 visits", "5+ visits", "visited more than 3 times", "only one visit"
  const visits = q.match(new RegExp(`${CMP}\\s*${NUM}\\s*(?:visits?|times|appointments?|bookings?)`));
  const visitsPlus = q.match(/(\d+)\s*\+\s*(?:visits?|times|appointments?)/);
  const visitedTimes = q.match(new RegExp(`visited\\s*${CMP}\\s*${NUM}\\s*times?`));
  if (visitsPlus) {
    pushUnique(conditions, { field: 'visit_count', operator: 'gte', value: Number(visitsPlus[1]) });
  } else if (visits || visitedTimes) {
    const m = (visits ?? visitedTimes) as RegExpMatchArray;
    const op = comparator(m[1]);
    const n = toNumber(m[2]);
    if (op && n !== null) pushUnique(conditions, { field: 'visit_count', operator: op, value: n });
  } else if (/\b(one[- ]time|single visit|visited once|only visited once|first[- ]time)\b/.test(q)) {
    pushUnique(conditions, { field: 'visit_count', operator: 'eq', value: 1 });
  } else if (/\b(regulars|loyal)\b/.test(q)) {
    pushUnique(conditions, { field: 'visit_count', operator: 'gte', value: 5 });
  }

  // Tags: "tagged vip", "with tag newsletter", "#vip"
  const FILLER = new Set(['customers', 'customer', 'people', 'clients', 'client', 'who', 'are', 'with', 'and', 'that', 'as', 'the', 'a']);
  const tagAfter = q.match(/(?:tagged|with (?:the )?tag|tag)\s+["“]?([\p{L}\p{N}_-]{1,40})["”]?/u) ?? q.match(/#([\p{L}\p{N}_-]{1,40})/u);
  const tagBefore = q.match(/([\p{L}\p{N}_-]{1,40})\s+tagged\b/u);
  const tagValue =
    tagAfter && !FILLER.has(tagAfter[1]) ? tagAfter[1] : tagBefore && !FILLER.has(tagBefore[1]) ? tagBefore[1] : null;
  if (tagValue) pushUnique(conditions, { field: 'tag', operator: 'eq', value: tagValue });

  if (conditions.length === 0) return null;
  const limited = conditions.slice(0, 5);
  return {
    kind: 'segment',
    conditions: limited,
    summary: limited.map(describeCondition).join(' · '),
    href: `/segments?rules=${encodeURIComponent(encodeRules(limited))}`,
  };
}
