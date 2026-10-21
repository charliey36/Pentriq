import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { getUsageSummary } from '@/lib/resend-usage-service';
import { EmailUsageLive } from '../email-usage-live';

export const metadata: Metadata = { title: 'Email Usage' };
export const dynamic = 'force-dynamic';

export default async function EmailUsagePage() {
  const usage = await getUsageSummary();
  return (
    <div>
      <PageHeader back={{ href: '/admin', label: 'Admin Portal' }} title="Email Usage" icon="mail" tone="slate" description="Transactional email consumption straight from Resend. Updates automatically when an email is sent." />
      <SectionCard title="Resend usage">
        <EmailUsageLive initial={usage} />
      </SectionCard>
    </div>
  );
}
