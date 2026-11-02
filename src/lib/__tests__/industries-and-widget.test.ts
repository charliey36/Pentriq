import { INDUSTRIES, industryBySlug, presetServices } from '../industries';
import { pickWidgetReviews, averageRating, embedSnippet, isUuid, WIDGET_MAX_COMMENT } from '../review-widget';
import { isBillingOverrideEmail } from '../billing';

describe('industries', () => {
  it('has unique slugs and sensible service intervals', () => {
    const slugs = INDUSTRIES.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const i of INDUSTRIES) {
      expect(i.services.length).toBeGreaterThan(0);
      expect(i.faq.length).toBeGreaterThan(0);
      i.services.forEach((s) => { expect(s.name).toBeTruthy(); expect(s.intervalDays).toBeGreaterThanOrEqual(0); expect(s.intervalDays).toBeLessThanOrEqual(365); });
    }
  });
  it('turns one-off services into null intervals and ignores unknown slugs', () => {
    expect(presetServices('heating-engineers')).toContainEqual({ name: 'Repair or call-out', recurrence_interval_days: null });
    expect(presetServices('heating-engineers')).toContainEqual({ name: 'Boiler service', recurrence_interval_days: 365 });
    expect(presetServices('nope')).toEqual([]);
    expect(industryBySlug('barbers')?.noun).toBe('barbershop');
  });
});

describe('review widget', () => {
  const r = (rating: number, comment: string | null, date: string, name = 'Sam') => ({ reviewer_name: name, rating, comment, review_date: date });
  it('shows only 4-5 star reviews with text, newest first, capped', () => {
    const picked = pickWidgetReviews([r(5, 'Great', '2026-01-01'), r(3, 'Meh', '2026-02-01'), r(5, null, '2026-03-01'), r(4, '  ', '2026-03-02'), r(4, 'Good', '2026-04-01')]);
    expect(picked.map((x) => x.comment)).toEqual(['Good', 'Great']);
    expect(pickWidgetReviews(Array.from({ length: 20 }, (_, i) => r(5, `c${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`)))).toHaveLength(6);
  });
  it('trims long comments and defaults blank names', () => {
    const [x] = pickWidgetReviews([r(5, 'a'.repeat(1000), '2026-01-01', '  ')]);
    expect(x.comment!.length).toBeLessThanOrEqual(WIDGET_MAX_COMMENT);
    expect(x.comment!.endsWith('…')).toBe(true);
    expect(x.reviewer_name).toBe('Customer');
  });
  it('averages all ratings, validates ids and builds an iframe snippet', () => {
    expect(averageRating([5, 4, 4])).toBe(4.3);
    expect(averageRating([])).toBeNull();
    expect(isUuid('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(true);
    expect(isUuid('../etc/passwd')).toBe(false);
    expect(embedSnippet('https://app.example.com/', 'abc')).toContain('src="https://app.example.com/widget/abc"');
  });
});

describe('billing override', () => {
  it('is empty unless configured', () => {
    expect(isBillingOverrideEmail('a@b.com', {} as NodeJS.ProcessEnv)).toBe(false);
    expect(isBillingOverrideEmail('A@b.com', { BILLING_OVERRIDE_EMAILS: ' a@b.com ,c@d.com' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});

import { summariseImpact, monthsBetween } from '../impact';
describe('summariseImpact', () => {
  const base = { attributedRevenue: 0, attributedVisits: 0, reviewsCompleted: 0, requestsSent: 0, monthlyPrice: 19, monthsActive: 2 };
  it('never invents figures when there is no data', () => {
    const s = summariseImpact(base);
    expect(s.multiple).toBeNull();
    expect(s.paidForItself).toBe(false);
    expect(s.nextStep).toMatch(/first review request/);
  });
  it('compares attributed revenue with what the subscription has cost', () => {
    const s = summariseImpact({ ...base, attributedRevenue: 190, attributedVisits: 4, requestsSent: 10 });
    expect(s.multiple).toBe(5);
    expect(s.paidForItself).toBe(true);
    expect(s.headline).toMatch(/4 returning visits/);
  });
  it('reports not-yet-paid-for when revenue is below cost', () => {
    expect(summariseImpact({ ...base, attributedRevenue: 20, attributedVisits: 1, requestsSent: 5 }).paidForItself).toBe(false);
  });
  it('counts at least one month', () => {
    expect(monthsBetween(new Date('2026-11-01'), new Date('2026-11-02'))).toBe(1);
    expect(monthsBetween(new Date('2026-08-15'), new Date('2026-11-02'))).toBe(3);
  });
});
