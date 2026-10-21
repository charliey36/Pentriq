import type { IconName } from '@/components/ui/icons';

/**
 * The Admin Portal's sections. Adding a future admin tool (SMS usage, AI usage, queue health,
 * referral diagnostics...) is one entry here plus a page under src/app/(app)/admin/<slug>.
 * Entries without `href` render as "Coming soon" cards.
 */
export type AdminSection = { key: string; title: string; description: string; icon: IconName; href?: string };

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: 'email-usage', title: 'Email Usage', description: 'Daily and monthly Resend consumption, live.', icon: 'mail', href: '/admin/email-usage' },
  { key: 'email-activity', title: 'Email Activity', description: 'Recent sends with status and message IDs.', icon: 'inbox', href: '/admin/email-activity' },
  { key: 'email-preview', title: 'Email Preview', description: 'Preview review request emails on desktop and mobile.', icon: 'eye', href: '/admin/email-preview' },
  { key: 'businesses', title: 'Businesses', description: 'All organisations. Delete an organisation.', icon: 'users', href: '/admin/organisations' },
  { key: 'changelog', title: 'Changelog', description: 'Publish product updates.', icon: 'lightbulb', href: '/admin/changelog' },
  { key: 'system-monitoring', title: 'System Monitoring', description: 'Queues, background jobs and API consumption.', icon: 'chart' },
  { key: 'users', title: 'Users', description: 'Accounts and access.', icon: 'userPlus' },
  { key: 'feature-flags', title: 'Feature Flags', description: 'Switch features on and off.', icon: 'bolt' },
  { key: 'integrations', title: 'Integrations', description: 'Google, Stripe and other connections.', icon: 'cog' },
  { key: 'system-health', title: 'System Health', description: 'Uptime and error rates.', icon: 'shield' },
  { key: 'audit-logs', title: 'Audit Logs', description: 'Who changed what, and when.', icon: 'clock' },
];
