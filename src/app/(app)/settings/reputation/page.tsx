import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { dateKey } from '@/lib/google-review-analytics';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Notice } from '@/components/ui/notice';
import { SettingsTabs } from '@/components/settings-tabs';
import { SnapshotManager, type SnapshotRow } from './snapshot-manager';

export const metadata: Metadata = { title: 'Reputation Tracking' };

export default async function ReputationSettingsPage() {
  const business = await requireBusiness();
  const { data, error } = await createClient()
    .from('manual_review_snapshots')
    .select('id, snapshot_date, review_count, average_rating')
    .eq('business_id', business.id)
    .order('snapshot_date', { ascending: true })
    .limit(2000);

  // Oldest first to compute gains, shown newest first.
  const rows: SnapshotRow[] = (data ?? [])
    .map((s, i, all) => ({
      id: s.id,
      date: s.snapshot_date,
      count: s.review_count,
      rating: Number(s.average_rating),
      gained: i === 0 ? 0 : Math.max(0, s.review_count - all[i - 1].review_count),
      change: i === 0 || s.review_count === 0 || all[i - 1].review_count === 0 ? null : Math.round((Number(s.average_rating) - Number(all[i - 1].average_rating)) * 100) / 100,
    }))
    .reverse();

  return (
    <div>
      <PageHeader
        title="Reputation Tracking"
        icon="star"
        tone="amber"
        description="Record your review count and average rating whenever you like. Pentriq works out how many reviews you gained, how your rating moved and how fast you're growing."
        tabs={<SettingsTabs />}
      />
      <div className="space-y-6">
        {error && (
          <Notice variant="error">
            Couldn&apos;t load snapshots ({error.message}). Apply migration <code>0021_reputation_tracking.sql</code> in Supabase.
          </Notice>
        )}
        <SectionCard
          title="Add a snapshot"
          description={
            <>
              Take it from your Google Business Profile or any review site. Tracking is manual until the{' '}
              <Link href="/settings/integrations" className="underline">Google integration</Link> is available.
            </>
          }
        >
          <SnapshotManager rows={rows} today={dateKey(new Date())} />
        </SectionCard>
        <p className="text-xs text-ink-3">
          See the results on <Link href="/reviews" className="underline">Reviews Analytics</Link>. Saving a snapshot for a date that already has one replaces it.
        </p>
      </div>
    </div>
  );
}
