import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { getCustomerVisitsWithRebookingStatus } from '@/lib/visits';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatCard } from '@/components/ui/stat-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icons';
import { LogVisitForm } from './log-visit-form';
import { TagEditor } from './tag-editor';
import { CustomerActionsMenu } from '../customer-actions-menu';
import { formatUKCurrency, formatUKDate } from '@/lib/uk-defaults';

export const metadata: Metadata = { title: 'Customer' };

function formatDate(value: string) {
  return formatUKDate(new Date(value));
}

export default async function CustomerDetailPage({ params: paramsPromise }: { params: Promise<{ customerId: string }> }) {
  const params = await paramsPromise;
  const business = await requireBusiness();
  const supabase = createClient();

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', params.customerId)
    .eq('business_id', business.id)
    .maybeSingle();

  if (!customer) notFound();

  const [{ data: services }, { data: tags }, { data: loyaltyProgram }, { data: ledgerEntries }, { visits, rebookingStatus, lifetimeValue }] =
    await Promise.all([
      supabase.from('services').select('*').eq('business_id', business.id).eq('is_active', true),
      supabase.from('customer_tags').select('*').eq('customer_id', customer.id),
      supabase.from('loyalty_programs').select('*').eq('business_id', business.id).maybeSingle(),
      supabase.from('loyalty_ledger_entries').select('delta').eq('customer_id', customer.id),
      getCustomerVisitsWithRebookingStatus(supabase, customer.id),
    ]);

  const servicesById = new Map((services ?? []).map((s) => [s.id, s]));
  const loyaltyBalance = (ledgerEntries ?? []).reduce((sum, e) => sum + e.delta, 0);

  const statusBadge = rebookingStatus.isLapsed ? (
    <Badge tone="danger" dot>
      Lapsed
    </Badge>
  ) : rebookingStatus.isDue ? (
    <Badge tone="warning" dot>
      Due for rebooking
    </Badge>
  ) : null;

  const adornment = (
    <span className="flex flex-wrap items-center gap-2">
      {customer.archived_at && <Badge tone="neutral">Archived</Badge>}
      {statusBadge}
    </span>
  );

  return (
    <div>
      <PageHeader
        back={{ href: '/customers', label: 'Customers' }}
        title={customer.name}
        leading={<Avatar name={customer.name} size="xl" />}
        adornment={adornment}
        actions={
          <div className="flex items-center gap-2">
            <CustomerActionsMenu
              customerId={customer.id}
              customer={{ name: customer.name, email: customer.email, phone: customer.phone }}
              isArchived={Boolean(customer.archived_at)}
            />
          </div>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="mail" className="h-3.5 w-3.5 text-ink-4" />
              {customer.email}
            </span>
            {customer.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="phone" className="h-3.5 w-3.5 text-ink-4" />
                {customer.phone}
              </span>
            )}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Lifetime value"
          tone="emerald"
          value={formatUKCurrency(lifetimeValue)}
          icon="chart"
          hint={`${visits.length} visit${visits.length === 1 ? '' : 's'} logged`}
        />
        <StatCard
          label="Next expected visit"
          tone="sky"
          value={
            rebookingStatus.nextExpectedVisitAt
              ? formatDate(rebookingStatus.nextExpectedVisitAt.toISOString())
              : '\u2014'
          }
          icon="calendar"
          hint={
            rebookingStatus.nextExpectedVisitAt
              ? 'Based on the service rebooking interval'
              : 'Log a visit with a service to predict this'
          }
        />
        <StatCard
          label="Loyalty points"
          tone="amber"
          value={loyaltyProgram?.is_active ? loyaltyBalance.toLocaleString('en-GB') : '\u2014'}
          icon="gift"
          hint={loyaltyProgram?.is_active ? 'Current balance' : 'Loyalty program is off'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Log a visit" description="Record a visit to update lifetime value, rebooking timing and loyalty points." className="scroll-mt-24" >
            <div id="log-visit">
              <LogVisitForm customerId={customer.id} services={services ?? []} />
            </div>
          </SectionCard>

          <SectionCard title="Visit history" flush>
            {visits.length > 0 ? (
              <div className="scroll-thin overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Service</th>
                      <th className="text-right">Price</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((visit) => (
                      <tr key={visit.id}>
                        <td className="whitespace-nowrap">{formatDate(visit.visited_at)}</td>
                        <td className="font-medium text-ink">
                          {visit.service_id
                            ? servicesById.get(visit.service_id)?.name ?? 'Unknown service'
                            : 'General visit'}
                        </td>
                        <td className="text-right tabular-nums">
                          {visit.price != null ? formatUKCurrency(visit.price) : '\u2014'}
                        </td>
                        <td className="text-ink-3">{visit.notes ?? '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="calendar"
                title="No visits logged yet"
                description="Log this customer's first visit above to start tracking value and rebooking."
                className="py-10"
              />
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Tags" description="Use tags to build segments, like vip or newsletter.">
            <TagEditor customerId={customer.id} tags={tags ?? []} />
          </SectionCard>

          <SectionCard title="Details">
            <dl className="space-y-3.5 text-[13px]">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-3">Customer since</dt>
                <dd className="font-medium text-ink">{formatDate(customer.created_at)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-3">Email</dt>
                <dd>
                  {customer.unsubscribed_at ? (
                    <Badge tone="neutral">Unsubscribed</Badge>
                  ) : (
                    <Badge tone="success" dot>
                      Subscribed
                    </Badge>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-3">Last service</dt>
                <dd className="font-medium text-ink">
                  {customer.last_service_date ? formatDate(customer.last_service_date) : '\u2014'}
                </dd>
              </div>
              {customer.source && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-3">Source</dt>
                  <dd className="font-medium capitalize text-ink">{customer.source}</dd>
                </div>
              )}
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
