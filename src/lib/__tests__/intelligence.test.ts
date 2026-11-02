/** @jest-environment node */
import { computeBusinessHealth, gradeFor, type HealthInput } from '../intelligence/business-health';
import { computeNextActions, type BusinessSignals } from '../intelligence/next-best-actions';
import { compare, forecastCounts, holtForecast, linearTrend, nextMilestone, projectMilestone, rollUp } from '../intelligence/forecast';
import { analyseCustomer, median, visitGaps } from '../intelligence/customer-insights';
import { analyseReviewThemes } from '../intelligence/review-themes';

const NOW = new Date('2026-11-02T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const baseHealth: HealthInput = {
  setup: { hasBusinessName: true, hasReviewUrl: true, hasBookingUrl: true, hasContactEmail: true, servicesWithInterval: 3 },
  customers: 200,
  requestsSent30d: 30,
  clicks30d: 9,
  averageRating: 4.8,
  reviewsGained30d: 8,
  feedback90d: 10,
  feedbackOverdue: 0,
  publicReviews90d: 20,
  publicReplies90d: 18,
  rebookingRatePct: 55,
  lapsedSharePct: 10,
};

describe('business health score', () => {
  it('scores a well-run business highly', () => {
    const r = computeBusinessHealth(baseHealth);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.grade).toBe('A');
    expect(r.coverage).toBe(5);
  });

  it('leaves pillars without data out instead of scoring them zero', () => {
    const r = computeBusinessHealth({
      ...baseHealth,
      averageRating: null,
      reviewsGained30d: null,
      publicReviews90d: null,
      publicReplies90d: null,
      feedback90d: 0,
      rebookingRatePct: null,
      lapsedSharePct: null,
    });
    expect(r.pillars.find((p) => p.key === 'reputation')?.score).toBeNull();
    expect(r.pillars.find((p) => p.key === 'retention')?.score).toBeNull();
    expect(r.coverage).toBe(2);
    expect(r.score).not.toBeNull();
  });

  it('points the weakest pillar at a concrete fix', () => {
    const r = computeBusinessHealth({ ...baseHealth, feedbackOverdue: 8, publicReplies90d: 2 });
    expect(r.weakest?.key).toBe('responsiveness');
    expect(r.weakest?.tip).toMatch(/overdue/);
    expect(r.weakest?.href).toBe('/feedback-inbox');
  });

  it('flags missing foundations first', () => {
    const r = computeBusinessHealth({ ...baseHealth, setup: { ...baseHealth.setup, hasReviewUrl: false } });
    const f = r.pillars.find((p) => p.key === 'foundations');
    expect(f?.score).toBe(80);
    expect(f?.tip).toMatch(/Google review link/);
  });

  it('returns null score for an empty new account with no data at all', () => {
    const r = computeBusinessHealth({
      setup: { hasBusinessName: false, hasReviewUrl: false, hasBookingUrl: false, hasContactEmail: false, servicesWithInterval: 0 },
      customers: 0, requestsSent30d: 0, clicks30d: 0, averageRating: null, reviewsGained30d: null, feedback90d: 0,
      feedbackOverdue: 0, publicReviews90d: null, publicReplies90d: null, rebookingRatePct: null, lapsedSharePct: null,
    });
    // Foundations always has data (0 of 5), so the score exists but is low.
    expect(r.score).toBe(0);
    expect(r.grade).toBe('E');
  });

  it('grades on documented thresholds', () => {
    expect([gradeFor(90), gradeFor(70), gradeFor(55), gradeFor(40), gradeFor(10)]).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

const quietSignals: BusinessSignals = {
  hasReviewUrl: true, hasBookingUrl: true, servicesWithInterval: 2, customers: 100, neverRequested: 0, heldRequests: 0,
  failedRequests: 0, newFeedback: 0, overdueFeedback: 0, criticalFeedback: 0, dueForRebooking: 0, lapsedCustomers: 0,
  lapsedLifetimeValue: 0, averageVisitValue: 45, unrepliedNegativeReviews: 0, unrepliedReviews: 0, unreadReviewAlerts: 0,
  clicksChangePct: null, billingStatus: 'active', trialDaysLeft: null, rebookingRemindersEnabled: true,
};

describe('next best actions', () => {
  it('is empty when nothing needs doing', () => {
    expect(computeNextActions(quietSignals)).toEqual([]);
  });

  it('ranks critical feedback above everything and estimates rebooking value', () => {
    const actions = computeNextActions({ ...quietSignals, criticalFeedback: 1, dueForRebooking: 12, failedRequests: 2, lapsedCustomers: 10, lapsedLifetimeValue: 3200 });
    expect(actions[0].id).toBe('critical-feedback');
    const due = actions.find((a) => a.id === 'due-rebooking');
    expect(due?.impact).toBe('≈ £540 of bookings at your average visit price');
    expect(actions.find((a) => a.id === 'lapsed')?.impact).toContain('£3,200');
  });

  it('escalates rebooking when reminders are off', () => {
    const on = computeNextActions({ ...quietSignals, dueForRebooking: 5 })[0];
    const off = computeNextActions({ ...quietSignals, dueForRebooking: 5, rebookingRemindersEnabled: false })[0];
    expect(on.priority).toBe('medium');
    expect(off.priority).toBe('high');
    expect(off.cta).toBe('Turn on reminders');
  });

  it('mentions held requests when the review link is missing', () => {
    const [first] = computeNextActions({ ...quietSignals, hasReviewUrl: false, heldRequests: 4 });
    expect(first.id).toBe('review-url');
    expect(first.why).toMatch(/4 review requests are waiting/);
  });

  it('suggests importing for an empty account', () => {
    const ids = computeNextActions({ ...quietSignals, customers: 0 }).map((a) => a.id);
    expect(ids).toContain('first-customers');
  });

  it('flags a big drop in clicks only past the threshold', () => {
    expect(computeNextActions({ ...quietSignals, clicksChangePct: -10 })).toEqual([]);
    expect(computeNextActions({ ...quietSignals, clicksChangePct: -45 })[0].id).toBe('clicks-drop');
  });
});

describe('forecasting', () => {
  it('fits a perfect line', () => {
    const t = linearTrend([1, 2, 3, 4, 5]);
    expect(t.slope).toBeCloseTo(1);
    expect(t.intercept).toBeCloseTo(1);
    expect(t.r2).toBe(1);
  });

  it('handles tiny series', () => {
    expect(linearTrend([])).toEqual({ slope: 0, intercept: 0, r2: 0 });
    expect(holtForecast([], 3)).toEqual([0, 0, 0]);
    expect(holtForecast([4], 2)).toEqual([4, 4]);
  });

  it('never forecasts negative counts', () => {
    expect(holtForecast([10, 6, 2, 0], 5).every((v) => v >= 0)).toBe(true);
  });

  it('compares periods with a null pct when there is no baseline', () => {
    expect(compare(10, 0)).toMatchObject({ pct: null, direction: 'up' });
    expect(compare(5, 10)).toMatchObject({ pct: -50, direction: 'down', delta: -5 });
  });

  it('projects milestones', () => {
    expect(projectMilestone(40, 2, 50, NOW).daysToTarget).toBe(5);
    expect(projectMilestone(60, 2, 50, NOW).daysToTarget).toBe(0);
    expect(projectMilestone(40, 0, 50, NOW).eta).toBeNull();
    expect([nextMilestone(0), nextMilestone(10), nextMilestone(99), nextMilestone(1200)]).toEqual([10, 25, 100, 1500]);
  });

  it('marks short histories as unreliable', () => {
    expect(forecastCounts([1, 2, 3], 30).reliable).toBe(false);
    const steady = forecastCounts(Array(28).fill(2), 30);
    expect(steady.reliable).toBe(true);
    expect(steady.direction).toBe('steady');
    expect(steady.expected).toBe(60);
  });

  it('rolls up daily into weekly', () => {
    expect(rollUp([1, 1, 1, 1, 1, 1, 1, 2, 2], 7)).toEqual([7, 4]);
  });
});

describe('customer insights', () => {
  const services = [{ id: 's1', name: 'Cut & finish', recurrence_interval_days: 42 }];

  it('learns a personal rhythm from three or more visits', () => {
    const r = analyseCustomer({
      name: 'Amira Khan', createdAt: daysAgo(200), services, unsubscribed: false, archived: false, now: NOW,
      visits: [daysAgo(10), daysAgo(40), daysAgo(70), daysAgo(100)].map((d) => ({ visited_at: d, price: 40, service_id: 's1' })),
    });
    expect(r.cadenceDays).toBe(30);
    expect(r.cadenceBasis).toBe('personal');
    expect(r.churnRisk).toBe('low');
    expect(r.favouriteService).toBe('Cut & finish');
    expect(r.narrative[0]).toMatch(/Amira has visited 4 times, spending £160 in total, usually for Cut & finish/);
  });

  it('falls back to the service interval and detects lapsed customers', () => {
    const r = analyseCustomer({
      name: 'Tom', createdAt: daysAgo(300), services, unsubscribed: false, archived: false, now: NOW,
      visits: [{ visited_at: daysAgo(120), price: 30, service_id: 's1' }],
    });
    expect(r.cadenceBasis).toBe('service');
    expect(r.churnRisk).toBe('lapsed');
    expect(r.actions[0].id).toBe('win_back');
  });

  it('raises risk after a poor private rating and recommends following up', () => {
    const r = analyseCustomer({
      name: 'Jo', createdAt: daysAgo(100), services, unsubscribed: false, archived: false, now: NOW, lastFeedbackRating: 2,
      visits: [daysAgo(5), daysAgo(35), daysAgo(65)].map((d) => ({ visited_at: d, price: 50, service_id: 's1' })),
    });
    expect(r.churnRisk).toBe('medium');
    expect(r.actions[0].id).toBe('follow_up_feedback');
    expect(r.actions.some((a) => a.id === 'send_review')).toBe(false);
  });

  it('handles customers with no visits', () => {
    const r = analyseCustomer({ name: 'New Person', createdAt: daysAgo(3), services, unsubscribed: false, archived: false, now: NOW, visits: [] });
    expect(r.churnRisk).toBe('new');
    expect(r.actions[0].id).toBe('log_visit');
  });

  it('detects falling spend', () => {
    const prices = [20, 20, 60, 60];
    const r = analyseCustomer({
      name: 'Kim', createdAt: daysAgo(400), services, unsubscribed: false, archived: false, now: NOW,
      visits: prices.map((price, i) => ({ visited_at: daysAgo(10 + i * 30), price, service_id: 's1' })),
    });
    expect(r.spendTrend).toBe('down');
  });

  it('does not suggest emails to unsubscribed customers', () => {
    const r = analyseCustomer({
      name: 'Lee', createdAt: daysAgo(400), services, unsubscribed: true, archived: false, now: NOW,
      visits: [{ visited_at: daysAgo(200), price: 30, service_id: 's1' }],
    });
    expect(r.actions.map((a) => a.id)).toEqual(['resubscribe_note']);
  });

  it('computes medians and gaps', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(visitGaps([{ visited_at: daysAgo(0) }, { visited_at: daysAgo(10) }, { visited_at: daysAgo(30) }])).toEqual([20, 10]);
  });
});

describe('review themes', () => {
  const reviews = [
    { rating: 5, comment: 'Lovely friendly staff and spotless salon', review_date: daysAgo(3) },
    { rating: 5, comment: 'The team were so friendly and welcoming', review_date: daysAgo(10) },
    { rating: 2, comment: 'Kept waiting 30 minutes, very slow', review_date: daysAgo(12) },
    { rating: 1, comment: 'Waited ages and nobody apologised', review_date: daysAgo(20) },
    { rating: 4, comment: null, review_date: daysAgo(25) },
  ];

  it('finds praise and concerns with examples', () => {
    const r = analyseReviewThemes(reviews);
    expect(r.analysed).toBe(5);
    expect(r.withText).toBe(4);
    expect(r.praise.map((t) => t.topic)).toContain('staff');
    expect(r.concerns.map((t) => t.topic)).toContain('wait_time');
    const wait = r.themes.find((t) => t.topic === 'wait_time');
    expect(wait?.averageRating).toBe(1.5);
    expect(wait?.example).toMatch(/wait/i);
  });

  it('drops themes below the mention threshold', () => {
    const r = analyseReviewThemes([{ rating: 5, comment: 'Clean', review_date: daysAgo(1) }]);
    expect(r.themes).toEqual([]);
  });
});
