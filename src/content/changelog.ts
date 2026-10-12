export type ChangelogEntry = {
  date: string; // ISO
  title: string;
  tag: 'New' | 'Improved' | 'Infrastructure';
  description: string;
};

export type ChangelogMonth = { month: string; entries: ChangelogEntry[] };

/** Newest first. Add new entries at the top of the current month. */
export const CHANGELOG: ChangelogMonth[] = [
  {
    month: 'October 2026',
    entries: [
      {
        date: '2026-10-12',
        title: 'Blog launched',
        tag: 'New',
        description:
          'Practical guides on Google reviews, Google Business Profile, customer feedback and reputation management, with a searchable index and categories.',
      },
      {
        date: '2026-10-12',
        title: 'Google Search Console setup',
        tag: 'Infrastructure',
        description:
          'pentriq.cloud is verified with Google Search Console, with a valid sitemap, robots.txt, canonical URLs and structured data.',
      },
      {
        date: '2026-10-11',
        title: 'Stripe billing integration',
        tag: 'New',
        description:
          'Subscribe through Stripe Checkout, manage your card, invoices and cancellation in the Stripe customer portal, and see your plan, next payment date and recent invoices on the Billing page.',
      },
      {
        date: '2026-10-11',
        title: 'Custom domain migration to pentriq.cloud',
        tag: 'Infrastructure',
        description:
          'Pentriq now lives at pentriq.cloud. Links in emails, review requests and the app use the new domain, and the www address redirects to it.',
      },
      {
        date: '2026-10-10',
        title: 'Review analytics improvements',
        tag: 'Improved',
        description:
          'Tabbed Reviews Analytics with review count, average rating, rating change since last month, review velocity and plain-English insights, with manual reputation tracking that works without a Google connection.',
      },
    ],
  },
];
