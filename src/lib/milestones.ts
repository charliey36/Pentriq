/**
 * Activation milestone emails. Each milestone is emailed to the business owner
 * at most once. If several are reached between two daily checks (e.g. an
 * import plus 20 requests), only the most advanced one is emailed and the
 * earlier ones are marked as sent, so nobody gets a burst of emails.
 */
import { APP_NAME } from '@/lib/brand';
import { renderOwnerEmail } from '@/lib/email-templates/owner-email';

export type MilestoneKey = 'first_import' | 'first_20_requests' | 'first_review' | 'first_10_reviews';

export type MilestoneStats = {
  customers: number;
  requestsSent: number;
  reviews: number;
};

export const MILESTONES: Array<{ key: MilestoneKey; reached: (s: MilestoneStats) => boolean }> = [
  { key: 'first_import', reached: (s) => s.customers >= 1 },
  { key: 'first_20_requests', reached: (s) => s.requestsSent >= 20 },
  { key: 'first_review', reached: (s) => s.reviews >= 1 },
  { key: 'first_10_reviews', reached: (s) => s.reviews >= 10 },
];

/** Milestones reached but not yet recorded, oldest first. */
export function newlyReached(stats: MilestoneStats, sent: Record<string, string> | null | undefined): MilestoneKey[] {
  return MILESTONES.filter((m) => m.reached(stats) && !sent?.[m.key]).map((m) => m.key);
}

export function milestoneEmail(key: MilestoneKey, stats: MilestoneStats, businessName: string) {
  const name = businessName?.trim() || 'your business';
  const base = { eyebrow: 'Milestone unlocked', footnote: `You are receiving this because ${name} is on ${APP_NAME}.` };
  const copy: Record<MilestoneKey, { subject: string; heading: string; intro: string[]; highlight: string; cta: { label: string; path: string } }> = {
    first_import: {
      subject: 'Your customers are in. Next: your first review requests',
      heading: 'Your first import is done',
      intro: [`${stats.customers} customer${stats.customers === 1 ? ' is' : 's are'} now in ${APP_NAME}. That is the hardest part finished.`],
      highlight: 'Next step: check your Google review link in Settings so requests go out. Requests are sent automatically a day after each service.',
      cta: { label: 'Check my review link', path: '/settings' },
    },
    first_20_requests: {
      subject: `${APP_NAME} has now sent ${stats.requestsSent} review requests for you`,
      heading: `${stats.requestsSent} review requests sent`,
      intro: ['Your reputation is working in the background. Reminders go out automatically at 3 and 7 days to anyone who has not replied.'],
      highlight: 'Businesses usually see reviews start landing within a week of their first batch going out.',
      cta: { label: 'See how requests are performing', path: '/dashboard' },
    },
    first_review: {
      subject: 'You just got your first review through Pentriq',
      heading: 'Your first review is in 🎉',
      intro: ['A customer you asked has left a review. Every one makes the next customer more likely to choose you.'],
      highlight: 'Keep it going: the more completed jobs you import, the more reviews you collect, with no extra effort.',
      cta: { label: 'View your reviews', path: '/reviews' },
    },
    first_10_reviews: {
      subject: '10 reviews and counting',
      heading: '10 new reviews collected',
      intro: ['That is real, visible social proof for your business. Nice work.'],
      highlight: 'Subscribe to keep requests, reminders and weekly reports running without a gap.',
      cta: { label: 'Keep it going', path: '/settings/billing' },
    },
  };
  const c = copy[key];
  const { html, text } = renderOwnerEmail({ preheader: c.intro[0], eyebrow: base.eyebrow, heading: c.heading, intro: c.intro, highlight: c.highlight, cta: c.cta, footnote: base.footnote });
  return { subject: c.subject, html, text };
}
