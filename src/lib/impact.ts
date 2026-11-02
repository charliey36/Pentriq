/**
 * "Return on Pentriq": turns numbers the app already measures into a plain-language value statement.
 * Everything is derived from real data and labelled as an estimate where attribution is approximate.
 * No invented benchmarks: with no data the card says what to do next instead of a made-up figure.
 */
export type ImpactInput = {
  /** Revenue from visits within 7 days of a rebooking-reminder click (last-touch estimate). */
  attributedRevenue: number;
  attributedVisits: number;
  reviewsCompleted: number;
  requestsSent: number;
  monthlyPrice: number;
  /** Whole months the business has existed (min 1) so the multiple compares like with like. */
  monthsActive: number;
};

export type ImpactSummary = {
  headline: string;
  /** Attributed revenue divided by what the subscription has cost over the period; null until there is revenue. */
  multiple: number | null;
  paidForItself: boolean;
  nextStep: string | null;
};

export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(1, months);
}

export function summariseImpact(i: ImpactInput): ImpactSummary {
  const cost = i.monthlyPrice * Math.max(1, i.monthsActive);
  const multiple = i.attributedRevenue > 0 && cost > 0 ? Math.round((i.attributedRevenue / cost) * 10) / 10 : null;
  const paidForItself = i.attributedRevenue >= cost && i.attributedRevenue > 0;

  let headline: string;
  if (i.attributedRevenue > 0) {
    headline = `${i.attributedVisits} returning visit${i.attributedVisits === 1 ? '' : 's'} followed a rebooking reminder, worth an estimated £${Math.round(i.attributedRevenue).toLocaleString('en-GB')}.`;
  } else if (i.reviewsCompleted > 0) {
    headline = `${i.reviewsCompleted} customer${i.reviewsCompleted === 1 ? '' : 's'} followed your review link so far.`;
  } else if (i.requestsSent > 0) {
    headline = `${i.requestsSent} review request${i.requestsSent === 1 ? '' : 's'} sent. Results appear here as customers respond.`;
  } else {
    headline = 'Your results will appear here once your first requests are sent.';
  }

  let nextStep: string | null = null;
  if (i.requestsSent === 0) nextStep = 'Send your first review request to get started.';
  else if (i.attributedRevenue === 0) nextStep = 'Log visits and give services a rebooking interval so Pentriq can bring customers back and measure it.';

  return { headline, multiple, paidForItself, nextStep };
}
