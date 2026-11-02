/**
 * Pentriq Health Score: one explainable number (0-100) for how well a business is running its reputation and
 * retention, built from five pillars an owner can each act on.
 *
 *   Foundations    - is everything set up so automation can work at all?
 *   Reach          - are review requests going out, and are customers clicking through?
 *   Reputation     - rating and how fast new reviews arrive
 *   Responsiveness - how quickly private feedback and public reviews get a reply
 *   Retention      - do customers come back?
 *
 * A pillar with no data yet is left out (and the others re-weighted) rather than scored as zero, so a brand-new
 * account isn't told it is failing at things it hasn't started. Targets are deliberately round, documented
 * numbers chosen as reasonable goals for a small service business, not industry statistics.
 */

export type PillarKey = 'foundations' | 'reach' | 'reputation' | 'responsiveness' | 'retention';

export const PILLAR_LABELS: Record<PillarKey, string> = {
  foundations: 'Foundations',
  reach: 'Reach',
  reputation: 'Reputation',
  responsiveness: 'Responsiveness',
  retention: 'Retention',
};

/** Goals behind each pillar. Changing a number here changes the score everywhere. */
export const TARGETS = {
  /** Review requests a month that keep a steady flow of reviews for a small business. */
  monthlyRequests: 30,
  /** Share of delivered requests whose review link gets clicked. */
  clickThroughPct: 25,
  /** New public reviews a month. */
  monthlyReviews: 8,
  /** Share of visits followed by another within 30 days. */
  rebookingRatePct: 50,
  /** Share of recent public reviews with an owner reply. */
  replyRatePct: 80,
} as const;

const WEIGHTS: Record<PillarKey, number> = {
  foundations: 0.15,
  reach: 0.25,
  reputation: 0.25,
  responsiveness: 0.15,
  retention: 0.2,
};

export type HealthInput = {
  setup: {
    hasBusinessName: boolean;
    hasReviewUrl: boolean;
    hasBookingUrl: boolean;
    hasContactEmail: boolean;
    servicesWithInterval: number;
  };
  customers: number;
  /** Requests (first sends and reminders) sent in the last 30 days. */
  requestsSent30d: number;
  /** Counted review-link clicks in the last 30 days. */
  clicks30d: number;
  /** Google average rating, or the private-feedback average when Google isn't connected. Null with neither. */
  averageRating: number | null;
  /** New public reviews in the last 30 days (null when Google isn't connected). */
  reviewsGained30d: number | null;
  /** Private feedback received in the last 90 days and how much of it is still new past the 48h target. */
  feedback90d: number;
  feedbackOverdue: number;
  /** Public reviews in the last 90 days and how many have an owner reply (null without Google). */
  publicReviews90d: number | null;
  publicReplies90d: number | null;
  /** 30-day rebooking rate, 0-100, or null without enough visit history. */
  rebookingRatePct: number | null;
  /** Share of customers with visit history who are lapsed (0-100), or null. */
  lapsedSharePct: number | null;
};

export type Pillar = {
  key: PillarKey;
  label: string;
  /** 0-100, or null when there's no data for it yet. */
  score: number | null;
  weight: number;
  /** One line of evidence behind the score. */
  detail: string;
  /** The single most useful thing to do to raise this pillar. */
  tip: string;
  href: string;
};

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

export type HealthReport = {
  score: number | null;
  grade: Grade | null;
  label: string;
  pillars: Pillar[];
  strongest: Pillar | null;
  weakest: Pillar | null;
  /** How many pillars had data. */
  coverage: number;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export function gradeFor(score: number): Grade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

const GRADE_LABEL: Record<Grade, string> = {
  A: 'Excellent',
  B: 'Strong',
  C: 'Steady',
  D: 'Needs attention',
  E: 'At risk',
};

function foundations(i: HealthInput): Pillar {
  const checks = [
    i.setup.hasBusinessName,
    i.setup.hasReviewUrl,
    i.setup.hasBookingUrl,
    i.setup.hasContactEmail,
    i.setup.servicesWithInterval > 0,
  ];
  const done = checks.filter(Boolean).length;
  const missing = !i.setup.hasReviewUrl
    ? 'Add your Google review link so requests can send.'
    : !i.setup.hasBookingUrl
      ? 'Add your booking link so reminders can rebook in one click.'
      : i.setup.servicesWithInterval === 0
        ? 'Give your services a rebooking interval so reminders go out on time.'
        : !i.setup.hasContactEmail
          ? 'Add a contact email so customer replies reach you.'
          : 'Everything is set up. Keep your links current.';
  return {
    key: 'foundations',
    label: PILLAR_LABELS.foundations,
    score: Math.round((done / checks.length) * 100),
    weight: WEIGHTS.foundations,
    detail: `${done} of ${checks.length} essentials set up`,
    tip: missing,
    href: i.setup.servicesWithInterval === 0 && i.setup.hasReviewUrl && i.setup.hasBookingUrl ? '/settings/services' : '/settings',
  };
}

function reach(i: HealthInput): Pillar {
  if (i.customers === 0 && i.requestsSent30d === 0) {
    return {
      key: 'reach', label: PILLAR_LABELS.reach, score: null, weight: WEIGHTS.reach,
      detail: 'No customers yet', tip: 'Import your customer list to start sending review requests.', href: '/customers/import',
    };
  }
  const volume = clamp(pct(i.requestsSent30d, TARGETS.monthlyRequests));
  const ctr = i.requestsSent30d > 0 ? pct(i.clicks30d, i.requestsSent30d) : 0;
  const ctrScore = clamp(pct(ctr, TARGETS.clickThroughPct));
  const score = Math.round(volume * 0.5 + ctrScore * 0.5);
  return {
    key: 'reach',
    label: PILLAR_LABELS.reach,
    score,
    weight: WEIGHTS.reach,
    detail: `${i.requestsSent30d} requests and ${i.clicks30d} clicks in 30 days${i.requestsSent30d > 0 ? ` (${Math.round(ctr)}% click-through)` : ''}`,
    tip:
      i.requestsSent30d < TARGETS.monthlyRequests
        ? `Aim for ${TARGETS.monthlyRequests} requests a month: connect your booking system or import recent customers.`
        : ctr < TARGETS.clickThroughPct
          ? 'Personalise the request message and send it within a day of the visit to lift click-through.'
          : 'Great reach. Keep requests flowing after every visit.',
    href: i.requestsSent30d < TARGETS.monthlyRequests ? '/settings/integrations' : '/settings',
  };
}

function reputation(i: HealthInput): Pillar {
  if (i.averageRating === null && i.reviewsGained30d === null) {
    return {
      key: 'reputation', label: PILLAR_LABELS.reputation, score: null, weight: WEIGHTS.reputation,
      detail: 'No rating data yet', tip: 'Connect Google Business Profile or record your rating in Reputation settings.', href: '/settings/reputation',
    };
  }
  // 3.0★ scores 0, 5.0★ scores 100: below three stars is already a serious problem for a local business.
  const ratingScore = i.averageRating === null ? null : clamp(((i.averageRating - 3) / 2) * 100);
  const velocityScore = i.reviewsGained30d === null ? null : clamp(pct(i.reviewsGained30d, TARGETS.monthlyReviews));
  const score = Math.round(
    ratingScore !== null && velocityScore !== null ? ratingScore * 0.65 + velocityScore * 0.35 : (ratingScore ?? velocityScore ?? 0)
  );
  const parts: string[] = [];
  if (i.averageRating !== null) parts.push(`${i.averageRating.toFixed(1)}★ average`);
  if (i.reviewsGained30d !== null) parts.push(`${i.reviewsGained30d} new review${i.reviewsGained30d === 1 ? '' : 's'} in 30 days`);
  return {
    key: 'reputation',
    label: PILLAR_LABELS.reputation,
    score,
    weight: WEIGHTS.reputation,
    detail: parts.join(' · '),
    tip:
      i.averageRating !== null && i.averageRating < 4.3
        ? 'Reply to every critical review and follow up private feedback quickly; recent reviews weigh most.'
        : 'Keep a steady stream of fresh reviews: Google favours recent ones.',
    href: '/reviews',
  };
}

function responsiveness(i: HealthInput): Pillar {
  const hasFeedback = i.feedback90d > 0;
  const hasPublic = (i.publicReviews90d ?? 0) > 0 && i.publicReplies90d !== null;
  if (!hasFeedback && !hasPublic) {
    return {
      key: 'responsiveness', label: PILLAR_LABELS.responsiveness, score: null, weight: WEIGHTS.responsiveness,
      detail: 'Nothing to respond to yet', tip: 'When feedback arrives, reply within two days.', href: '/feedback-inbox',
    };
  }
  const feedbackScore = hasFeedback ? clamp(100 - pct(i.feedbackOverdue, i.feedback90d) * 1.5) : null;
  const replyRate = hasPublic ? pct(i.publicReplies90d ?? 0, i.publicReviews90d ?? 0) : null;
  const replyScore = replyRate === null ? null : clamp(pct(replyRate, TARGETS.replyRatePct));
  const score = Math.round(
    feedbackScore !== null && replyScore !== null ? feedbackScore * 0.5 + replyScore * 0.5 : (feedbackScore ?? replyScore ?? 0)
  );
  const parts: string[] = [];
  if (hasFeedback) parts.push(`${i.feedbackOverdue} of ${i.feedback90d} private messages overdue`);
  if (replyRate !== null) parts.push(`${Math.round(replyRate)}% of recent Google reviews replied to`);
  return {
    key: 'responsiveness',
    label: PILLAR_LABELS.responsiveness,
    score,
    weight: WEIGHTS.responsiveness,
    detail: parts.join(' · '),
    tip:
      i.feedbackOverdue > 0
        ? `Reply to the ${i.feedbackOverdue} overdue feedback message${i.feedbackOverdue === 1 ? '' : 's'}: a reply suggestion is ready in the inbox.`
        : replyRate !== null && replyRate < TARGETS.replyRatePct
          ? 'Reply to unanswered Google reviews. Draft with AI makes it a one-minute job.'
          : 'You respond fast. Keep it up.',
    href: i.feedbackOverdue > 0 ? '/feedback-inbox' : '/reviews?tab=reviews',
  };
}

function retention(i: HealthInput): Pillar {
  if (i.rebookingRatePct === null) {
    return {
      key: 'retention', label: PILLAR_LABELS.retention, score: null, weight: WEIGHTS.retention,
      detail: 'Not enough visit history', tip: 'Log visits (or connect your booking system) so Pentriq can measure and drive rebooking.', href: '/settings/integrations',
    };
  }
  const rateScore = clamp(pct(i.rebookingRatePct, TARGETS.rebookingRatePct));
  const lapsedPenalty = i.lapsedSharePct === null ? 0 : Math.min(30, i.lapsedSharePct * 0.4);
  const score = Math.round(clamp(rateScore - lapsedPenalty));
  return {
    key: 'retention',
    label: PILLAR_LABELS.retention,
    score,
    weight: WEIGHTS.retention,
    detail: `${i.rebookingRatePct}% rebook within 30 days${i.lapsedSharePct !== null ? ` · ${Math.round(i.lapsedSharePct)}% of customers lapsed` : ''}`,
    tip:
      i.lapsedSharePct !== null && i.lapsedSharePct > 25
        ? 'Build a "lapsed" segment and let win-back reminders bring them back.'
        : 'Make sure every service has a rebooking interval so reminders go out at the right time.',
    href: i.lapsedSharePct !== null && i.lapsedSharePct > 25 ? '/segments' : '/settings/services',
  };
}

export function computeBusinessHealth(input: HealthInput): HealthReport {
  const pillars = [foundations(input), reach(input), reputation(input), responsiveness(input), retention(input)];
  const scored = pillars.filter((p) => p.score !== null);
  const totalWeight = scored.reduce((sum, p) => sum + p.weight, 0);
  const score = totalWeight > 0 ? Math.round(scored.reduce((sum, p) => sum + (p.score as number) * p.weight, 0) / totalWeight) : null;
  const grade = score === null ? null : gradeFor(score);
  const sorted = [...scored].sort((a, b) => (b.score as number) - (a.score as number));
  return {
    score,
    grade,
    label: grade ? GRADE_LABEL[grade] : 'Getting started',
    pillars,
    strongest: sorted[0] ?? null,
    weakest: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    coverage: scored.length,
  };
}
