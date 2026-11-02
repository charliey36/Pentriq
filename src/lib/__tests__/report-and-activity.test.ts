/** @jest-environment node */
import { buildKpis, executiveSummary, formatKpi, kpisToCsv, periodBounds, resolvePeriod, type ReportCounts } from '../intelligence/report';
import { buildActivity, countByKind, groupByDay, parseKind, parseWindow, auditLabel, type RawActivity } from '../activity-feed';

const counts: ReportCounts = {
  newCustomers: [40, 20],
  requestsSent: [100, 80],
  clicks: [30, 16],
  feedbackReceived: [6, 0],
  feedbackRating: [4.25, null],
  visits: [120, 110],
  revenue: [5400, 5000],
  rebookingReminders: [25, 25],
  reviewsGained: [12, 8],
};

describe('executive report', () => {
  it('resolves periods safely', () => {
    expect(resolvePeriod('90d')).toBe('90d');
    expect(resolvePeriod('forever')).toBe('30d');
    expect(resolvePeriod(undefined)).toBe('30d');
  });

  it('builds back-to-back periods of equal length', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    const { current, previous } = periodBounds('30d', now);
    expect(current.to.getTime() - current.from.getTime()).toBe(30 * 86_400_000);
    expect(previous.to.getTime()).toBe(current.from.getTime());
  });

  it('computes changes, with click-through in percentage points', () => {
    const kpis = buildKpis(counts);
    const by = (k: string) => kpis.find((x) => x.key === k)!;
    expect(by('customers').pct).toBe(100);
    expect(by('reviews').pct).toBe(50);
    expect(by('ctr').current).toBe(30);
    expect(by('ctr').previous).toBe(20);
    expect(by('ctr').pct).toBe(10);
    expect(by('feedbackRating').pct).toBeNull();
    expect(by('rebooking').pct).toBe(0);
  });

  it('formats values for UK readers', () => {
    expect(formatKpi(5400, 'currency')).toBe('£5,400');
    expect(formatKpi(30.5, 'percent')).toBe('30.5%');
    expect(formatKpi(4.25, 'rating')).toBe('4.3★');
    expect(formatKpi(null, 'number')).toBe('—');
  });

  it('writes a short, factual summary that names the biggest mover', () => {
    const lines = executiveSummary(buildKpis(counts), 'Glow Studio', '30 days');
    expect(lines[0]).toBe('Glow Studio sent 100 review requests in the last 30 days, and customers clicked through 30 times.');
    expect(lines[1]).toBe('You gained 12 public reviews, up 50% on the period before.');
    expect(lines.some((l) => l.startsWith('Review-link clicks rose 87.5%') || l.startsWith('New customers rose 100%'))).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('handles an empty period', () => {
    const empty: ReportCounts = {
      newCustomers: [0, 0], requestsSent: [0, 0], clicks: [0, 0], feedbackReceived: [0, 0], feedbackRating: [null, null],
      visits: [0, 0], revenue: [0, 0], rebookingReminders: [0, 0], reviewsGained: [null, null],
    };
    const lines = executiveSummary(buildKpis(empty), '', '90 days');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Your business sent no review requests/);
  });

  it('exports CSV with raw numbers and safe text', () => {
    const csv = kpisToCsv(buildKpis({ ...counts, newCustomers: [5, 10] }), 'Last 30 days');
    expect(csv.split('\r\n')[0]).toBe('Metric,Last 30 days,Previous period,Change %');
    expect(csv).toContain('New customers,5,10,-50');
  });
});

describe('activity timeline', () => {
  const raw: RawActivity = {
    customers: [{ id: 'c1', name: 'Ava', created_at: '2026-11-02T09:00:00Z', source: 'csv' }],
    messages: [
      { id: 'm1', customer_id: 'c1', purpose: 'review_request', channel: 'email', status: 'sent', sent_at: '2026-11-02T10:00:00Z', created_at: '2026-11-02T09:00:00Z' },
      { id: 'm2', customer_id: 'c2', purpose: 'rebooking_reminder', channel: 'sms', status: 'failed', sent_at: null, created_at: '2026-11-01T10:00:00Z' },
    ],
    clicks: [{ id: 'k1', customer_id: 'c1', occurred_at: '2026-11-02T11:00:00Z' }],
    visits: [{ id: 'v1', customer_id: 'c2', visited_at: '2026-10-25T10:00:00Z', price: 45, service_id: 's1' }],
    feedback: [{ id: 'f1', customer_id: 'c2', rating: 2, created_at: '2026-11-01T08:00:00Z', status: 'new' }],
    reviews: [{ id: 'r1', reviewer_name: 'Ben', rating: 5, review_date: '2026-10-30T10:00:00Z', reply_text: null }],
    audit: [{ id: 7, action: 'team.invited', actor_email: 'owner@example.com', created_at: '2026-10-31T10:00:00Z', target_type: 'invitation' }],
    customerNames: new Map([['c1', 'Ava'], ['c2', 'Ben']]),
    serviceNames: new Map([['s1', 'Colour']]),
  };

  it('merges every source newest first with readable titles', () => {
    const events = buildActivity(raw);
    expect(events.map((e) => e.id)).toEqual(['click-k1', 'message-m1', 'customer-c1', 'message-m2', 'feedback-f1', 'audit-7', 'review-r1', 'visit-v1']);
    expect(events.find((e) => e.id === 'message-m2')).toMatchObject({ title: 'Rebooking reminder to Ben failed', sentiment: 'negative' });
    expect(events.find((e) => e.id === 'visit-v1')).toMatchObject({ title: 'Ben visited for Colour', detail: '£45' });
    expect(events.find((e) => e.id === 'feedback-f1')?.title).toBe('Ben sent private feedback (2★)');
  });

  it('groups by UK day with friendly labels', () => {
    const days = groupByDay(buildActivity(raw), new Date('2026-11-02T15:00:00Z'));
    expect(days[0].label).toBe('Today');
    expect(days[1].label).toBe('Yesterday');
    expect(days[2].label).toBe('Saturday 31 October');
  });

  it('counts and parses filters', () => {
    const counts = countByKind(buildActivity(raw));
    expect(counts).toMatchObject({ message: 2, click: 1, team: 1 });
    expect(parseKind('visit')).toBe('visit');
    expect(parseKind('<script>')).toBe('all');
    expect(parseWindow('90')).toBe(90);
    expect(parseWindow('9999')).toBe(30);
    expect(auditLabel('team.invited')).toBe('Teammate invited');
    expect(auditLabel('something.new_here')).toBe('Something new here');
  });
});
