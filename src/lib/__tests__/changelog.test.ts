import { describe, expect, it } from '@jest/globals';
import { buildDigest, groupChangelog, weekStart, type ChangelogEntry } from '@/lib/changelog';

const e = (title: string, entry_date: string, tag: ChangelogEntry['tag'] = 'New'): ChangelogEntry => ({ id: title, title, description: '', tag, entry_date });

describe('weekStart', () => {
  it('returns the Monday of the week (weeks start on Monday)', () => {
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // a Monday
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Sunday belongs to the week that began the 12th
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
  });
});

describe('groupChangelog', () => {
  it('groups by month then week, newest first, with "Week of" labels', () => {
    const g = groupChangelog([e('Blog Launch', '2026-10-06'), e('Stripe Billing', '2026-10-12'), e('Custom Domain', '2026-10-13'), e('Old thing', '2026-09-30')]);
    expect(g.map((m) => m.month)).toEqual(['October 2026', 'September 2026']);
    expect(g[0].weeks.map((w) => w.label)).toEqual(['Week of 12 October', 'Week of 5 October']);
    expect(g[0].weeks[0].entries.map((x) => x.title)).toEqual(['Custom Domain', 'Stripe Billing']);
    expect(g[1].weeks[0].label).toBe('Week of 28 September');
  });
  it('handles an empty list', () => expect(groupChangelog([])).toEqual([]));
});

describe('buildDigest', () => {
  it('writes one short release-note sentence from the titles, grouped by tag', () => {
    expect(
      buildDigest([
        { title: 'Stripe subscriptions', tag: 'New' },
        { title: 'the Pentriq blog', tag: 'New' },
        { title: 'customer import reliability', tag: 'Improved' },
      ])
    ).toBe('This week we introduced Stripe subscriptions and the Pentriq blog, and improved customer import reliability.');
  });
  it('uses titles exactly as written (proper nouns are never re-cased) and handles all three groups', () => {
    expect(buildDigest([{ title: 'Stripe billing', tag: 'New' }, { title: 'review analytics', tag: 'Improved' }, { title: 'DNS records', tag: 'Infrastructure' }])).toBe(
      'This week we introduced Stripe billing, improved review analytics, and updated DNS records.'
    );
  });
  it('copes with one item, trailing full stops and an empty list', () => {
    expect(buildDigest([{ title: 'Changelog page.', tag: 'New' }])).toBe('This week we introduced Changelog page.');
    expect(buildDigest([])).toBe('');
  });
});
