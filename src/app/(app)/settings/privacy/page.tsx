import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { SettingsTabs } from '@/components/settings-tabs';
import { DeleteAccountForm } from './delete-account-form';

export const metadata: Metadata = { title: 'Data & privacy' };

export default async function PrivacySettingsPage() {
  const business = await requireBusiness();
  return (
    <div>
      <PageHeader
        title="Data & privacy"
        icon="cog"
        tone="slate"
        description="Download a copy of your data, or close your account."
        tabs={<SettingsTabs />}
      />
      <div className="space-y-6">
        <SectionCard title="Export your data" description="A copy of everything stored for your business: customers, messages, feedback, visits, reviews and settings. Sign-in tokens and keys are never included.">
          <div className="flex flex-wrap gap-3">
            <a href="/api/account/export" className="btn btn-primary">Download everything (JSON)</a>
            <a href="/api/account/export?format=csv" className="btn btn-secondary">Download customers (CSV)</a>
          </div>
        </SectionCard>

        <SectionCard
          title="Delete your account"
          description={`This permanently deletes ${business.name || 'your business'} and every customer, message and report in it. Any active subscription is cancelled first. This cannot be undone, so download your data above if you need it.`}
        >
          <DeleteAccountForm />
        </SectionCard>
      </div>
    </div>
  );
}
