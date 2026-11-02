import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAccess } from '@/lib/business';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import {
  SEGMENT_PRESETS,
  computeCustomerMetrics,
  decodeRules,
  describeCondition,
  filterMetrics,
  findPreset,
  loadSegmentInputs,
  normaliseStoredConditions,
  type CustomerMetrics,
  type SegmentCondition,
} from '@/lib/segments';
import { csvCell } from '@/lib/account-export';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icons';
import { toneStyle } from '@/components/ui/tones';
import { AskPentriqButton } from '@/components/intelligence/ask-button';
import { formatUKDate } from '@/lib/uk-defaults';
import { CreateSegmentForm } from './create-segment-form';
import { DeleteSegmentButton } from './delete-segment-button';
import { PreviewActions } from './preview-actions';

export const metadata: Metadata = { title: 'Segments' };

const PREVIEW_ROWS = 50;
const CSV_ROWS = 5000;

const REBOOKING_BADGE: Record<CustomerMetrics['rebooking'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  on_track: { label: 'On track', tone: 'success' },
  due: { label: 'Due', tone: 'warning' },
  lapsed: { label: 'Lapsed', tone: 'danger' },
  unknown: { label: '—', tone: 'neutral' },
};

function membersCsv(members: CustomerMetrics[]): string {
  const header = ['Name', 'Email', 'Lifetime value', 'Visits', 'Last visit', 'Rebooking status', 'Subscribed'];
  const rows = members.slice(0, CSV_ROWS).map((m) => [
    csvCell(m.customer.name),
    csvCell(m.customer.email),
    String(m.lifetimeValue),
    String(m.visitCount),
    m.lastVisitAt ? m.lastVisitAt.slice(0, 10) : '',
    m.rebooking,
    m.subscribed ? 'yes' : 'no',
  ]);
  return `${[header.join(','), ...rows.map((r) => r.join(','))].join('\r\n')}\r\n`;
}

export default async function SegmentsPage({ searchParams }: { searchParams?: { preset?: string; rules?: string; segment?: string; name?: string } }) {
  const { business, role } = await requireAccess();
  const supabase = createClient();

  const [{ data: segments }, inputs] = await Promise.all([
    supabase.from('segments').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
    loadSegmentInputs(supabase, business.id),
  ]);
  // Metrics are computed once and reused for every preset, saved segment and preview on the page.
  const metrics = computeCustomerMetrics(inputs);
  const customerTotal = metrics.length;

  const saved = (segments ?? []).map((segment) => {
    const parsed = normaliseStoredConditions(segment.rule_definition);
    const conditions = parsed.ok ? parsed.conditions : [];
    return { ...segment, conditions, memberCount: conditions.length ? filterMetrics(metrics, conditions).length : 0 };
  });
  const presets = SEGMENT_PRESETS.map((p) => ({ ...p, count: filterMetrics(metrics, p.conditions).length }));

  // Preview: a preset, ad-hoc rules (e.g. from Ask Pentriq) or a saved segment's members.
  const preset = findPreset(searchParams?.preset);
  const savedPreview = searchParams?.segment ? saved.find((s) => s.id === searchParams.segment) ?? null : null;
  const adHoc = decodeRules(searchParams?.rules);
  const previewConditions: SegmentCondition[] | null = savedPreview?.conditions ?? preset?.conditions ?? adHoc;
  const previewName = savedPreview?.name ?? preset?.name ?? (searchParams?.name?.slice(0, 80) || '');
  const previewMembers = previewConditions ? filterMetrics(metrics, previewConditions).sort((a, b) => b.lifetimeValue - a.lifetimeValue) : [];
  const reachable = previewMembers.filter((m) => m.subscribed).length;
  const canExport = can(role, 'data.export');
  const canSend = can(role, 'customers.write');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segments"
        icon="funnel"
        tone="violet"
        description="Live customer groups, built from visit history, spend, rebooking status and tags. Preview who matches, then message them in one click."
        actions={<AskPentriqButton />}
      />

      {previewConditions && (
        <section className="card overflow-hidden ring-1 ring-inset ring-violet-500/25" aria-labelledby="preview-title">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="eyebrow text-violet-700 dark:text-violet-300">{savedPreview ? 'Saved segment' : 'Preview'}</p>
              <h2 id="preview-title" className="mt-1 text-lg font-semibold tracking-[-0.02em] text-ink">
                {previewName || 'Matching customers'}{' '}
                <span className="text-ink-3">· {previewMembers.length.toLocaleString('en-GB')}</span>
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {previewConditions.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-ink-2 ring-1 ring-inset ring-line-strong/60">
                    <Icon name="funnel" className="h-3 w-3 text-ink-4" />
                    {describeCondition(c)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <PreviewActions
                rulesJson={JSON.stringify(previewConditions)}
                reachable={reachable}
                canSend={canSend}
                csv={canExport && previewMembers.length > 0 ? membersCsv(previewMembers) : null}
                filename={`segment-${(previewName || 'preview').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`}
              />
              <Link href="/segments" className="text-xs font-medium text-ink-3 hover:text-ink">
                Close preview
              </Link>
            </div>
          </div>

          {previewMembers.length === 0 ? (
            <EmptyState icon="users" title="Nobody matches yet" description="Try loosening a condition. Membership updates automatically as your data changes." className="py-10" />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="data-table data-table-hover">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="text-right">Lifetime value</th>
                    <th className="text-right">Visits</th>
                    <th>Last visit</th>
                    <th>Rebooking</th>
                  </tr>
                </thead>
                <tbody>
                  {previewMembers.slice(0, PREVIEW_ROWS).map((m) => (
                    <tr key={m.customer.id}>
                      <td>
                        <Link href={`/customers/${m.customer.id}`} className="flex items-center gap-3">
                          <Avatar name={m.customer.name} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{m.customer.name}</span>
                            <span className="block truncate text-xs text-ink-3">
                              {m.customer.email}
                              {!m.subscribed && ' · unsubscribed'}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-right tabular-nums">£{m.lifetimeValue.toLocaleString('en-GB')}</td>
                      <td className="text-right tabular-nums">{m.visitCount}</td>
                      <td className="whitespace-nowrap">{m.lastVisitAt ? formatUKDate(new Date(m.lastVisitAt)) : '—'}</td>
                      <td>
                        <Badge tone={REBOOKING_BADGE[m.rebooking].tone} dot={m.rebooking !== 'unknown'}>
                          {REBOOKING_BADGE[m.rebooking].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewMembers.length > PREVIEW_ROWS && (
                <p className="border-t border-line px-6 py-3 text-xs text-ink-3">
                  Showing the top {PREVIEW_ROWS} by lifetime value of {previewMembers.length.toLocaleString('en-GB')}.{canExport ? ' Export CSV for everyone.' : ''}
                </p>
              )}
            </div>
          )}
          {!savedPreview && (
            <div className="border-t border-line bg-surface-subtle/60 px-5 py-4 sm:px-6">
              <p className="mb-3 text-[13px] font-medium text-ink-2">Save this as a segment</p>
              <CreateSegmentForm key={JSON.stringify(previewConditions)} initial={previewConditions} initialName={previewName} />
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="templates-title">
        <h2 id="templates-title" className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">Start from a template</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {presets.map((p) => (
            <li key={p.key}>
              <Link
                href={`/segments?preset=${p.key}`}
                scroll={false}
                aria-current={preset?.key === p.key ? 'true' : undefined}
                style={toneStyle('violet')}
                className={`card-interactive spotlight tone-wash flex h-full flex-col p-4 ${preset?.key === p.key ? 'ring-2 ring-violet-500/40' : ''}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{p.name}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-2 ring-1 ring-inset ring-line">{p.count.toLocaleString('en-GB')}</span>
                </span>
                <span className="mt-1 text-xs leading-5 text-ink-3">{p.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {!previewConditions && (
        <SectionCard title="Build a segment" description="Combine up to five conditions. Every customer who matches is included automatically, and drops out when they stop matching.">
          <CreateSegmentForm />
        </SectionCard>
      )}

      <section aria-labelledby="saved-title">
        <h2 id="saved-title" className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">Saved segments</h2>
        {saved.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((segment) => (
              <li key={segment.id} style={toneStyle('violet')} className="card spotlight tone-wash flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-ink">{segment.name}</p>
                  {canSend && <DeleteSegmentButton segmentId={segment.id} segmentName={segment.name} />}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {segment.conditions.map((c, i) => (
                    <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-ink-2 ring-1 ring-inset ring-line-strong/60">
                      <Icon name="funnel" className="h-3 w-3 flex-shrink-0 text-ink-4" />
                      <span className="truncate">{describeCondition(c)}</span>
                    </span>
                  ))}
                </div>

                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-[-0.035em] text-ink tabular-nums">{segment.memberCount.toLocaleString('en-GB')}</span>
                  <span className="text-[13px] text-ink-3">
                    {segment.memberCount === 1 ? 'customer' : 'customers'}
                    {customerTotal > 0 && ` · ${Math.round((segment.memberCount / customerTotal) * 100)}% of all`}
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
                <Link href={`/segments?segment=${segment.id}`} scroll={false} className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-violet-700 hover:text-violet-800 dark:text-violet-300">
                  View members & send
                  <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card">
            <EmptyState icon="funnel" title="No saved segments yet" description="Pick a template above or build your own, then save it to reuse and message it any time." />
          </div>
        )}
      </section>
    </div>
  );
}
