import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { SettingsTabs } from '@/components/settings-tabs';
import { AddServiceForm } from './add-service-form';
import { DeactivateServiceButton } from './deactivate-service-button';
import { formatUKCurrency } from '@/lib/uk-defaults';

export const metadata: Metadata = { title: 'Services' };

export default async function ServicesPage() {
  const business = await requireBusiness();
  const supabase = createClient();

  const { data: services } = await supabase
    .from('services')
    .select('*')
    .eq('business_id', business.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    <div>
      <PageHeader
        title="Services"
        icon="tag"
        tone="sky"
        description="Define your services and how often customers typically need to rebook. This drives automated rebooking reminders on the customer detail page."
        tabs={<SettingsTabs />}
      />

      <SectionCard title="Add a service" description="Customers get a rebooking reminder once this interval has passed since their last visit.">
        <AddServiceForm />
      </SectionCard>

      <SectionCard className="mt-6" title="Your services" flush>
        {services && services.length > 0 ? (
          <div className="scroll-thin max-h-[20rem] overflow-auto">
            <table className="data-table data-table-hover">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rebook after</th>
                  <th className="text-right">Default price</th>
                  <th className="w-24" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td className="font-medium text-ink">{service.name}</td>
                    <td>
                      {service.recurrence_interval_days ? (
                        <Badge>{service.recurrence_interval_days} days</Badge>
                      ) : (
                        <span className="text-ink-4">{'\u2014'}</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {service.default_price != null ? formatUKCurrency(service.default_price) : '\u2014'}
                    </td>
                    <td className="text-right">
                      <DeactivateServiceButton serviceId={service.id} serviceName={service.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="tag"
            title="No services yet"
            description="Add your first service above, like a haircut every 30 days."
            className="py-10"
          />
        )}
      </SectionCard>
    </div>
  );
}
