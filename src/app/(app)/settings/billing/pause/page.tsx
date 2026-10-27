import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireBusiness } from '@/lib/business';
import { getBillingState, PLAN } from '@/lib/billing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPipelineStats } from '@/lib/pipeline-stats';
import { loadReputation } from '@/lib/reputation-data';
import { computeReputation } from '@/lib/reputation-metrics';
import { ESTIMATED_VALUE_PER_REVIEW, estimatedValue, isPaused } from '@/lib/pause';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { SettingsTabs } from '@/components/settings-tabs';
import { PauseForm } from './pause-form';

export const metadata: Metadata = { title: 'Pause subscription' };

export default async function PausePage() {
  const business = await requireBusiness();
  const billing = getBillingState(business);
  if ((billing.status !== 'active' && billing.status !== 'past_due') || isPaused(business)) redirect('/settings/billing');

  const [stats, rep] = await Promise.all([
    loadPipelineStats(createClient(), business.id),
    loadReputation(createAdminClient(), business.id, true),
  ]);
  const reputation = computeReputation(rep.snapshots, new Date().toISOString().slice(0, 10));
  const value = estimatedValue(stats.reviewsCompleted);

  const tiles: Array<[string, string]> = [
    ['Review requests sent', String(stats.requestsSent + stats.reminder1Sent + stats.reminder2Sent)],
    ['Customers who followed your review link', String(stats.reviewsCompleted)],
    ['Estimated value delivered', `${PLAN.currency}${value.toLocaleString('en-GB')}`],
    ['Reviews gained this month', reputation.hasData ? `+${reputation.gainedThisMonth}` : '—'],
    ['Total reviews', reputation.hasData ? String(reputation.totalReviews) : '—'],
    ['Average rating', reputation.averageRating === null ? '—' : reputation.averageRating.toFixed(1)],
  ];

  return (
    <div>
      <PageHeader back={{ href: '/settings/billing', label: 'Billing' }} title="Need a break?" icon="cog" tone="slate" description="Pause instead of cancelling. You keep all your data and pick up where you left off." tabs={<SettingsTabs />} />
      <div className="space-y-6">
        <SectionCard title="What Pentriq has done for you so far" description="Here is what you would be pausing.">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-surface-subtle p-4 ring-1 ring-inset ring-line">
                <dt className="text-xs text-ink-3">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-ink-3">
            The value figure is an estimate: customers who followed your review link × {PLAN.currency}{ESTIMATED_VALUE_PER_REVIEW} each. Pentriq cannot see inside Google, so this counts people who reached your review page, not confirmed reviews.
          </p>
        </SectionCard>

        <SectionCard title="Pause your subscription" description="While paused you will not be charged, no review requests or reminders are sent, and your data stays safe.">
          <PauseForm />
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-3">
            Prefer to leave? You can still cancel any time from <Link href="/settings/billing" className="font-medium text-brand-700 underline dark:text-brand-300">Billing</Link> using Manage billing.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
