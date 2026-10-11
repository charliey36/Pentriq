import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icons';

const BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'refresh', title: 'Auto-sync reviews', text: 'New Google reviews appear in Pentriq without lifting a finger.' },
  { icon: 'chart', title: 'Review growth tracking', text: 'See how many reviews you gain each month and how fast you are growing.' },
  { icon: 'star', title: 'Rating trend analytics', text: 'Watch your average rating move over time, with the distribution by star.' },
  { icon: 'chat', title: 'Review response management', text: 'Reply to reviews from Pentriq and see which ones still need an answer.' },
  { icon: 'bolt', title: 'New review alerts', text: 'Get told straight away about new reviews, 1-star reviews and rating drops.' },
];

/** Shown until GOOGLE_BUSINESS_API_APPROVED=true (Google gates Business Profile API access behind an approval). */
export function GoogleComingSoon() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-600/20 dark:text-brand-200">
          Integration Coming Soon
        </span>
        <p className="text-sm text-ink-3">Google Business Profile sync is waiting on Google&apos;s API approval.</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BENEFITS.map((b) => (
          <li key={b.title} className="flex items-start gap-3 rounded-xl border border-line p-3.5">
            <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-700 dark:text-brand-300">
              <Icon name={b.icon} className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{b.title}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-ink-3">{b.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-2">
        You don&apos;t have to wait: <Link href="/settings/reputation" className="font-medium underline">track your review count and rating manually</Link>{' '}
        and see growth, trends and insights on <Link href="/reviews" className="font-medium underline">Reviews Analytics</Link> today. When Google is connected, the same dashboard switches to live data.
      </p>
    </div>
  );
}
