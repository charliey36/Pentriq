import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { ImportCustomersForm } from './import-customers-form';

// Allow long imports on Vercel (default is 10s).
export const maxDuration = 60;

export const metadata: Metadata = { title: 'Import customers' };

export default async function ImportCustomersPage() {
  await requireBusiness();

  return (
    <div>
      <PageHeader
        back={{ href: '/customers', label: 'Customers' }}
        title="Import customers"
        icon="upload"
        tone="sky"
        description="Export your jobs from Excel, Google Sheets, ServiceM8, Jobber or Tradify, upload the file here, then review requests are sent automatically at 8:00am the day after each completed service."
      />

      <SectionCard>
        <ImportCustomersForm />
      </SectionCard>
    </div>
  );
}
