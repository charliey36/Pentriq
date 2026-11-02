/**
 * Next best actions: the proactive layer. Instead of an owner reading charts and deciding what to do, Pentriq
 * looks at the business's own numbers and says "do this next, here's why, here's what it's worth", ranked.
 *
 * Every action is derived from a measured signal (no invented benchmarks), carries a reason the owner can verify,
 * and links straight to where the work gets done. Money figures are labelled as estimates and are built only
 * from the business's own visit prices.
 */

export type ActionPriority = 'urgent' | 'high' | 'medium' | 'low';
/** A subset of the app's icon names, kept here so this module has no UI dependency. */
export type ActionIcon = 'warning' | 'chat' | 'star' | 'calendar' | 'users' | 'mail' | 'link' | 'bolt' | 'arrowDown' | 'clock' | 'gift' | 'sparkles' | 'lock';

export type BusinessSignals = {
  hasReviewUrl: boolean;
  hasBookingUrl: boolean;
  servicesWithInterval: number;
  customers: number;
  /** Customers who have never been sent a review request and can be contacted. */
  neverRequested: number;
  heldRequests: number;
  failedRequests: number;
  newFeedback: number;
  overdueFeedback: number;
  criticalFeedback: number;
  dueForRebooking: number;
  lapsedCustomers: number;
  /** Historic spend of the lapsed customers above. */
  lapsedLifetimeValue: number;
  /** Mean visit price across the business, for estimating the value of a rebooking. Null without prices. */
  averageVisitValue: number | null;
  /** Null when Google isn't connected. */
  unrepliedNegativeReviews: number | null;
  unrepliedReviews: number | null;
  unreadReviewAlerts: number;
  /** % change in review-link clicks, last 7 days vs the 7 before (null when not computable). */
  clicksChangePct: number | null;
  billingStatus: 'active' | 'trialing' | 'trial_available' | 'expired' | 'past_due' | string;
  trialDaysLeft: number | null;
  rebookingRemindersEnabled: boolean;
};

export type NextAction = {
  id: string;
  priority: ActionPriority;
  /** Higher sorts first. */
  score: number;
  icon: ActionIcon;
  title: string;
  why: string;
  /** Optional value statement, e.g. "≈ £540 of bookings". */
  impact?: string;
  href: string;
  cta: string;
};

const PRIORITY_BASE: Record<ActionPriority, number> = { urgent: 400, high: 300, medium: 200, low: 100 };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

export function computeNextActions(s: BusinessSignals): NextAction[] {
  const actions: NextAction[] = [];
  const add = (a: Omit<NextAction, 'score'> & { weight?: number }) => {
    const { weight = 0, ...rest } = a;
    actions.push({ ...rest, score: PRIORITY_BASE[a.priority] + weight });
  };

  if (s.criticalFeedback > 0) {
    add({
      id: 'critical-feedback', priority: 'urgent', icon: 'warning', weight: 50 + s.criticalFeedback,
      title: `${plural(s.criticalFeedback, 'customer')} raised a serious issue`,
      why: 'Their feedback mentions safety, a refund or legal action. A quick personal reply prevents most escalations.',
      href: '/feedback-inbox?view=critical', cta: 'Open triage',
    });
  }

  if (s.billingStatus === 'expired' || s.billingStatus === 'past_due') {
    add({
      id: 'billing', priority: 'urgent', icon: 'lock', weight: 40,
      title: s.billingStatus === 'past_due' ? 'Your last payment failed' : 'Your trial has ended',
      why: 'Review requests and reminders are paused until the subscription is active.',
      href: '/settings/billing', cta: 'Fix billing',
    });
  }

  if (!s.hasReviewUrl) {
    add({
      id: 'review-url', priority: 'urgent', icon: 'link', weight: 30,
      title: 'Add your Google review link',
      why: s.heldRequests > 0
        ? `${plural(s.heldRequests, 'review request is', 'review requests are')} waiting for it.`
        : 'Requests are held until Pentriq knows where to send customers.',
      href: '/settings', cta: 'Add link',
    });
  }

  if (s.unrepliedNegativeReviews && s.unrepliedNegativeReviews > 0) {
    add({
      id: 'reply-negative', priority: 'high', icon: 'star', weight: 30 + s.unrepliedNegativeReviews,
      title: `Reply to ${plural(s.unrepliedNegativeReviews, 'critical Google review')}`,
      why: 'Future customers read how you respond to 1-3★ reviews. Draft with AI writes a calm first version.',
      href: '/reviews?tab=reviews&filter=unreplied', cta: 'Reply now',
    });
  }

  if (s.overdueFeedback > 0) {
    add({
      id: 'overdue-feedback', priority: 'high', icon: 'chat', weight: 20 + s.overdueFeedback,
      title: `${plural(s.overdueFeedback, 'feedback message')} waiting over 2 days`,
      why: 'A suggested reply is drafted for each one. Sending it takes a minute.',
      href: '/feedback-inbox?view=overdue', cta: 'Reply',
    });
  } else if (s.newFeedback > 0) {
    add({
      id: 'new-feedback', priority: 'medium', icon: 'chat', weight: 20 + s.newFeedback,
      title: `${plural(s.newFeedback, 'new feedback message')} to read`,
      why: 'Replying within two days keeps unhappy customers from posting publicly.',
      href: '/feedback-inbox', cta: 'Open inbox',
    });
  }

  if (s.failedRequests > 0) {
    add({
      id: 'failed', priority: 'high', icon: 'warning', weight: 10 + Math.min(20, s.failedRequests),
      title: `${plural(s.failedRequests, 'review request')} failed to send`,
      why: 'Usually a mistyped email address. Fix the address and resend.',
      href: '/customers?status=failed', cta: 'Review failures',
    });
  }

  if (s.dueForRebooking > 0) {
    const value = s.averageVisitValue ? s.dueForRebooking * s.averageVisitValue : null;
    add({
      id: 'due-rebooking', priority: s.rebookingRemindersEnabled ? 'medium' : 'high', icon: 'calendar', weight: Math.min(60, s.dueForRebooking),
      title: `${plural(s.dueForRebooking, 'customer is', 'customers are')} due to rebook`,
      why: s.rebookingRemindersEnabled
        ? 'Reminders go out automatically. A personal nudge to your regulars converts even better.'
        : 'Rebooking reminders are switched off, so nobody is reminding them.',
      impact: value ? `≈ ${money(value)} of bookings at your average visit price` : undefined,
      href: '/segments?preset=due', cta: s.rebookingRemindersEnabled ? 'See who' : 'Turn on reminders',
    });
  }

  if (s.lapsedCustomers > 0) {
    add({
      id: 'lapsed', priority: 'medium', icon: 'users', weight: Math.min(50, Math.round(s.lapsedCustomers / 2)),
      title: `Win back ${plural(s.lapsedCustomers, 'lapsed customer')}`,
      why: 'They have gone more than twice their usual gap without a visit.',
      impact: s.lapsedLifetimeValue > 0 ? `They have spent ${money(s.lapsedLifetimeValue)} with you before` : undefined,
      href: '/segments?preset=lapsed', cta: 'Build win-back',
    });
  }

  if (s.heldRequests > 0 && s.hasReviewUrl) {
    add({
      id: 'held', priority: 'medium', icon: 'clock', weight: Math.min(40, s.heldRequests),
      title: `${plural(s.heldRequests, 'request is', 'requests are')} on hold`,
      why: 'They were held for your approval. Send them while the visit is still fresh.',
      href: '/customers?status=held', cta: 'Send held',
    });
  }

  if (s.neverRequested > 0 && s.hasReviewUrl) {
    add({
      id: 'never-requested', priority: 'medium', icon: 'mail', weight: Math.min(45, Math.round(s.neverRequested / 3)),
      title: `${plural(s.neverRequested, 'customer has', 'customers have')} never been asked for a review`,
      why: 'Your existing customers are the fastest source of new reviews.',
      href: '/customers?status=none', cta: 'Ask them',
    });
  }

  if (s.clicksChangePct !== null && s.clicksChangePct <= -30) {
    add({
      id: 'clicks-drop', priority: 'medium', icon: 'arrowDown', weight: Math.min(30, Math.abs(Math.round(s.clicksChangePct / 3))),
      title: `Review-link clicks fell ${Math.abs(Math.round(s.clicksChangePct))}% this week`,
      why: 'Check fewer requests are being sent, or try a warmer, shorter message.',
      href: '/analytics', cta: 'Investigate',
    });
  }

  if (!s.hasBookingUrl) {
    add({
      id: 'booking-url', priority: 'low', icon: 'link', weight: 30,
      title: 'Add your online booking link',
      why: 'Rebooking emails convert far better when customers can book in one tap.',
      href: '/settings', cta: 'Add link',
    });
  }

  if (s.servicesWithInterval === 0 && s.customers > 0) {
    add({
      id: 'service-intervals', priority: 'low', icon: 'bolt', weight: 25,
      title: 'Set rebooking intervals on your services',
      why: 'Pentriq uses them to time reminders and spot lapsed customers.',
      href: '/settings/services', cta: 'Set intervals',
    });
  }

  if (s.unreadReviewAlerts > 0) {
    add({
      id: 'review-alerts', priority: 'low', icon: 'star', weight: Math.min(20, s.unreadReviewAlerts),
      title: `${plural(s.unreadReviewAlerts, 'unread review alert')}`,
      why: 'New Google reviews and rating changes since you last looked.',
      href: '/reviews?tab=alerts', cta: 'View alerts',
    });
  }

  if (s.billingStatus === 'trialing' && s.trialDaysLeft !== null && s.trialDaysLeft <= 5) {
    add({
      id: 'trial-ending', priority: 'medium', icon: 'gift', weight: 10,
      title: `${plural(s.trialDaysLeft, 'day')} left in your trial`,
      why: 'Subscribe to keep requests and reminders running without a gap.',
      href: '/settings/billing', cta: 'Subscribe',
    });
  }

  if (s.customers === 0) {
    add({
      id: 'first-customers', priority: 'high', icon: 'users', weight: 35,
      title: 'Bring in your customers',
      why: 'Import a CSV from your booking system or connect Square, Acuity or Calendly.',
      href: '/customers/import', cta: 'Import',
    });
  }

  return actions.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
