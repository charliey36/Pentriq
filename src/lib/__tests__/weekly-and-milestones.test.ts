import { describe, expect, it } from '@jest/globals';
import { buildWeeklySummary, conversionRate, growthLine, platformFromUrl, type WeeklyStats } from '@/lib/weekly-summary';
import { MILESTONES, milestoneEmail, newlyReached } from '@/lib/milestones';
import { renderOwnerEmail } from '@/lib/email-templates/owner-email';

const stats: WeeklyStats = { businessName: 'Acme <Plumbing>', reviewsGained: 6, previousReviewsGained: 4, totalReviews: 120, averageRating: 4.7, requestsSent: 40, clickedThrough: 10, topPlatform: 'Google Reviews' };

describe('weekly summary', () => {
  it('contains every required figure and a growth trend', () => {
    const e = buildWeeklySummary(stats);
    expect(e.subject).toContain('6 new reviews');
    for (const needle of ['+6', '120', '4.7', '40', '25%', 'Google Reviews', 'Up 50% on last week']) expect(e.html).toContain(needle);
    expect(e.text).toContain('Reviews gained: +6');
    expect(e.html).toContain('/dashboard');
  });
  it('escapes the business name and never breaks when there is no review data', () => {
    const e = buildWeeklySummary({ ...stats, businessName: '<b>X</b>', reviewsGained: null, previousReviewsGained: null, totalReviews: null, averageRating: null });
    expect(e.html).not.toContain('<b>X</b>');
    expect(e.html).toContain('Connect Google');
    expect(e.html).toContain('—');
  });
  it('handles a quiet week with positive, honest messaging', () => {
    expect(buildWeeklySummary({ ...stats, reviewsGained: 0, requestsSent: 0, clickedThrough: 0 }).html).toContain('No review requests went out this week');
  });
  it('conversion rate and growth wording', () => {
    expect(conversionRate(10, 40)).toBe(25);
    expect(conversionRate(1, 0)).toBeNull();
    expect(growthLine(3, 3)).toMatch(/steady/);
    expect(growthLine(2, 5)).toMatch(/Consistency/);
    expect(growthLine(2, 0)).toMatch(/great start/);
  });
  it('names the platform from the review URL', () => {
    expect(platformFromUrl('https://g.page/r/abc/review')).toBe('Google Reviews');
    expect(platformFromUrl('https://uk.trustpilot.com/evaluate/x')).toBe('Trustpilot');
    expect(platformFromUrl('')).toBe('Your review page');
  });
  it('owner email layout is reusable and escapes everything', () => {
    const { html, text } = renderOwnerEmail({ preheader: 'p', heading: '<h>', intro: ['<i>'], stats: [{ label: 'a', value: '<1>' }], cta: { label: 'Go', path: '/x' } });
    expect(html).not.toContain('<h>');
    expect(html).not.toContain('<i>');
    expect(text).toContain('Go:');
  });
});

describe('milestones', () => {
  it('detects each milestone exactly when reached', () => {
    expect(newlyReached({ customers: 0, requestsSent: 0, reviews: 0 }, {})).toEqual([]);
    expect(newlyReached({ customers: 5, requestsSent: 0, reviews: 0 }, {})).toEqual(['first_import']);
    expect(newlyReached({ customers: 5, requestsSent: 19, reviews: 0 }, {})).toEqual(['first_import']);
    expect(newlyReached({ customers: 5, requestsSent: 20, reviews: 1 }, {})).toEqual(['first_import', 'first_20_requests', 'first_review']);
    expect(newlyReached({ customers: 50, requestsSent: 90, reviews: 10 }, {})).toHaveLength(MILESTONES.length);
  });
  it('never re-sends a milestone already recorded', () => {
    expect(newlyReached({ customers: 5, requestsSent: 25, reviews: 1 }, { first_import: 'x', first_20_requests: 'y' })).toEqual(['first_review']);
  });
  it('has a distinct, positive email for every milestone', () => {
    const subjects = MILESTONES.map((m) => milestoneEmail(m.key, { customers: 12, requestsSent: 20, reviews: 10 }, 'Acme').subject);
    expect(new Set(subjects).size).toBe(MILESTONES.length);
    expect(milestoneEmail('first_import', { customers: 12, requestsSent: 0, reviews: 0 }, 'Acme').html).toContain('12 customers are now in');
    expect(milestoneEmail('first_10_reviews', { customers: 1, requestsSent: 1, reviews: 10 }, 'Acme').html).toContain('/settings/billing');
  });
});
