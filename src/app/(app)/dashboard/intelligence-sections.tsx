import Link from 'next/link';
import type { Business } from '@/lib/database.types';
import { loadIntelligence } from '@/lib/intelligence/load';
import { HealthScoreCard } from '@/components/intelligence/health-score-card';
import { NextActions } from '@/components/intelligence/next-actions';
import { AskPentriqButton } from '@/components/intelligence/ask-button';
import { Icon, type IconName } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The dashboard's intelligence-driven parts. They run the heaviest data load on the page (loadIntelligence:
 * health score, next best actions), so each is rendered inside <Suspense>: the KPIs and chart stream first and
 * these arrive when ready. loadIntelligence is memoised per request, so both sections share one load.
 */

export type HeroInsight = { icon: IconName; text: string; href: string };

export async function HeroDoNext({ business, fallback }: { business: Business; fallback: HeroInsight[] }) {
  const intel = await loadIntelligence(business);
  const items: HeroInsight[] = intel.actions.map((a) => ({ icon: a.icon as IconName, text: a.title, href: a.href }));
  for (const f of fallback) if (items.length < 3) items.push(f);
  const highlights = items.slice(0, 3);

  if (highlights.length === 0) {
    return (
      <p className="flex items-center gap-3 px-3 pb-3 pt-1.5 text-[13px] font-medium text-white/85">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
          <Icon name="check" className="h-4 w-4" strokeWidth={2.2} />
        </span>
        All quiet &mdash; nothing needs your attention.
      </p>
    );
  }
  return (
    <ul>
      {highlights.map((item) => (
        <li key={item.text}>
          <Link href={item.href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-white/10">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
              <Icon name={item.icon} className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="flex-1 text-[13px] font-medium leading-5 text-white/95">{item.text}</span>
            <Icon name="chevronRight" className="h-4 w-4 text-white/50 transition duration-200 group-hover:translate-x-0.5 group-hover:text-white" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HeroDoNextSkeleton() {
  return (
    <ul role="status" aria-label="Loading suggestions">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5">
          <span className="h-8 w-8 flex-shrink-0 animate-pulse rounded-lg bg-white/15" />
          <span className="h-3.5 flex-1 animate-pulse rounded bg-white/15" />
        </li>
      ))}
    </ul>
  );
}

export async function IntelligenceRow({ business }: { business: Business }) {
  const intel = await loadIntelligence(business);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <NextActions actions={intel.actions} limit={4} className="lg:col-span-2" />
      <div className="space-y-3">
        <HealthScoreCard report={intel.health} compact />
        <div className="flex justify-end">
          <AskPentriqButton />
        </div>
      </div>
    </div>
  );
}

export function IntelligenceRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3" role="status" aria-label="Loading next best actions">
      <div className="card p-5 lg:col-span-2 sm:p-6">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mt-5 flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-56 max-w-full" />
              <Skeleton className="mt-2 h-3 w-80 max-w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="card flex flex-col items-center p-5 sm:p-6">
        <Skeleton className="h-3 w-36 self-start" />
        <Skeleton className="mt-6 h-[110px] w-[190px] rounded-t-full" />
        <Skeleton className="mt-6 h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
