/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { HealthScoreCard } from '@/components/intelligence/health-score-card';
import { NextActions } from '@/components/intelligence/next-actions';
import { CustomerInsightCard } from '@/components/intelligence/customer-insight-card';
import { ScoreGauge } from '@/components/ui/score-gauge';
import { Meter } from '@/components/ui/meter';
import { DeltaBadge } from '@/components/ui/delta-badge';
import { SegmentedNav } from '@/components/ui/segmented-nav';
import { computeBusinessHealth } from '../intelligence/business-health';
import { computeNextActions } from '../intelligence/next-best-actions';
import { analyseCustomer } from '../intelligence/customer-insights';

const health = computeBusinessHealth({
  setup: { hasBusinessName: true, hasReviewUrl: true, hasBookingUrl: false, hasContactEmail: true, servicesWithInterval: 1 },
  customers: 40, requestsSent30d: 12, clicks30d: 2, averageRating: 4.6, reviewsGained30d: 3, feedback90d: 4, feedbackOverdue: 1,
  publicReviews90d: null, publicReplies90d: null, rebookingRatePct: 38, lapsedSharePct: 20,
});

describe('intelligence components render', () => {
  it('health score card shows the score, every pillar and the biggest lift', () => {
    const html = renderToStaticMarkup(<HealthScoreCard report={health} />);
    expect(html).toContain('Pentriq Health Score');
    expect(html).toContain(`Score ${health.score} out of 100`);
    for (const p of health.pillars) expect(html).toContain(p.label);
    expect(html).toContain('Biggest lift');
  });

  it('next actions lists ranked items and an empty state', () => {
    const actions = computeNextActions({
      hasReviewUrl: true, hasBookingUrl: true, servicesWithInterval: 1, customers: 10, neverRequested: 3, heldRequests: 0, failedRequests: 1,
      newFeedback: 1, overdueFeedback: 1, criticalFeedback: 0, dueForRebooking: 2, lapsedCustomers: 0, lapsedLifetimeValue: 0, averageVisitValue: 40,
      unrepliedNegativeReviews: null, unrepliedReviews: null, unreadReviewAlerts: 0, clicksChangePct: null, billingStatus: 'active', trialDaysLeft: null,
      rebookingRemindersEnabled: true,
    });
    const html = renderToStaticMarkup(<NextActions actions={actions} limit={2} />);
    expect(html).toContain(actions[0].title);
    expect(html).toContain(`See ${actions.length - 2} more in Insights`);
    expect(renderToStaticMarkup(<NextActions actions={[]} />)).toContain('You are on top of everything');
  });

  it('customer insight card renders narrative, risk and actions', () => {
    const insight = analyseCustomer({
      name: 'Sam Lee', createdAt: '2026-01-01T00:00:00Z', unsubscribed: false, archived: false, now: new Date('2026-11-02T00:00:00Z'),
      services: [{ id: 's', name: 'Cut', recurrence_interval_days: 30 }],
      visits: [{ visited_at: '2026-08-01T00:00:00Z', price: 30, service_id: 's' }],
    });
    const html = renderToStaticMarkup(<CustomerInsightCard insight={insight} />);
    expect(html).toContain('Pentriq summary');
    expect(html).toContain('Lapsed');
    expect(html).toContain('Send a win-back reminder');
  });

  it('primitives handle missing data', () => {
    expect(renderToStaticMarkup(<ScoreGauge score={null} id="x" />)).toContain('Score not available yet');
    expect(renderToStaticMarkup(<Meter label="Reach" value={null} />)).toContain('No data');
    expect(renderToStaticMarkup(<DeltaBadge pct={null} current={0} />)).toBe('');
    expect(renderToStaticMarkup(<DeltaBadge pct={-12.5} />)).toContain('-13%');
    expect(renderToStaticMarkup(<DeltaBadge pct={4.25} />)).toContain('+4.3%');
    const nav = renderToStaticMarkup(<SegmentedNav label="Views" active="b" items={[{ key: 'a', label: 'A', href: '/a' }, { key: 'b', label: 'B', href: '/b', count: 3 }]} />);
    expect(nav).toContain('aria-current="page"');
    expect(nav).toContain('>3<');
  });
});
