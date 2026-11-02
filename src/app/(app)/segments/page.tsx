import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { evaluateSegment, loadSegmentInputs, type SegmentCondition } from '@/lib/segments';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icons';
import { toneStyle } from '@/components/ui/tones';
import { CreateSegmentForm } from './create-segment-form';
import { DeleteSegmentButton } from './delete-segment-button';

export const metadata: Metadata = { title: 'Segments' };

const fieldLabels: Record<string, string> = {
  days_since_last_visit: 'Days since last visit',
  lifetime_value: 'Lifetime value',
  visit_count: 'Visit count',
  tag: 'Tag',
};

const operatorLabels: Record<string, string> = {
  gt: '>',
  gte: '\u2265',
  lt: '<',
  lte: '\u2264',
  eq: '=',
};

export default async function SegmentsPage() {
  const business = await requireBusiness();
  const supabase = createClient();

  const { data: segments } = await supabase
    .from('segments')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id);
  const customerTotal = totalCustomers ?? 0;

  // Load once and reuse for every segment (previously the whole customer/visit tables were re-read per segment).
  const inputs = (segments ?? []).length > 0 ? await loadSegmentInputs(supabase, business.id) : undefined;
  const segmentsWithCounts = await Promise.all(
    (segments ?? []).map(async (segment) => {
      const members = await evaluateSegment(
        supabase,
        business.id,
        segment.rule_definition as SegmentCondition[],
        inputs
      );
      return { ...segment, memberCount: members.length };
    })
  );

  return (
    <div>
      <PageHeader
        title="Segments"
        icon="funnel"
        tone="violet"
        description="Dynamic customer segments, evaluated live from visit history, spend and tags — not a static list that goes stale."
      />

      <SectionCard
        title="Create a segment"
        description="Define a rule. Every customer who matches it is included automatically, and drops out when they stop matching."
      >
        <CreateSegmentForm />
      </SectionCard>

      <div className="mt-6">
        {segmentsWithCounts.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {segmentsWithCounts.map((segment) => {
              const condition = (segment.rule_definition as SegmentCondition[])[0];
              return (
                <li
                  key={segment.id}
                  style={toneStyle('violet')}
                  className="card spotlight tone-wash flex flex-col p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-ink">{segment.name}</p>
                    <DeleteSegmentButton segmentId={segment.id} segmentName={segment.name} />
                  </div>

                  {condition && (
                    <p className="mt-2.5 inline-flex w-fit max-w-full items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-ink-2 ring-1 ring-inset ring-line-strong/60">
                      <Icon name="funnel" className="h-3 w-3 flex-shrink-0 text-ink-4" />
                      <span className="truncate">
                        {fieldLabels[condition.field]} {operatorLabels[condition.operator]} {condition.value}
                      </span>
                    </p>
                  )}

                  <p className="mt-6 flex items-baseline gap-1.5">
                    <span className="text-4xl font-semibold tracking-[-0.035em] text-ink tabular-nums">
                      {segment.memberCount.toLocaleString('en-GB')}
                    </span>
                    <span className="text-[13px] text-ink-3">
                      {segment.memberCount === 1 ? 'customer' : 'customers'}
                      {customerTotal > 0 && ` \u00b7 ${Math.round((segment.memberCount / customerTotal) * 100)}% of all`}
                    </span>
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="bar-grow h-full rounded-full"
                      style={{
                        width: `${customerTotal > 0 ? Math.min(100, (segment.memberCount / customerTotal) * 100) : 0}%`,
                        backgroundImage: 'linear-gradient(90deg, rgb(var(--tone)), rgb(var(--tone-deep)))',
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card">
            <EmptyState
              icon="funnel"
              title="No segments yet"
              description="Create your first segment above, for example customers who haven't visited in 60+ days."
            />
          </div>
        )}
      </div>
    </div>
  );
}
