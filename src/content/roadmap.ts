export type RoadmapStatus = 'completed' | 'in-progress' | 'planned';

export type RoadmapItem = { title: string; description: string };

export const ROADMAP: { status: RoadmapStatus; label: string; icon: string; items: RoadmapItem[] }[] = [
  {
    status: 'completed',
    label: 'Completed',
    icon: '✅',
    items: [
      { title: 'Custom domain', description: 'Pentriq runs on pentriq.cloud, with www redirecting to the main domain.' },
      { title: 'Stripe billing', description: 'Checkout, customer portal, invoices and subscription status synced into Pentriq.' },
      { title: 'Review analytics', description: 'Review count, rating change, velocity and insights, from manual snapshots or Google data.' },
      { title: 'Customer management', description: 'Customers, CSV import, visit history, tags, segments and unsubscribe handling.' },
    ],
  },
  {
    status: 'in-progress',
    label: 'In progress',
    icon: '🚧',
    items: [
      {
        title: 'Google Business Profile integration',
        description: 'Connect a Business Profile to import reviews automatically. The integration is built and awaiting Google’s Business Profile API approval.',
      },
      { title: 'AI review insights', description: 'Summaries of themes and sentiment across your reviews and private feedback.' },
    ],
  },
  {
    status: 'planned',
    label: 'Planned',
    icon: '📋',
    items: [
      { title: 'Automated reporting', description: 'Scheduled monthly summaries of reviews, rating and request performance.' },
      { title: 'Reputation alerts', description: 'Faster notifications when a new low rating arrives or your average rating drops.' },
      { title: 'Competitor tracking', description: 'Compare your rating and review growth with nearby competitors.' },
    ],
  },
];
