import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { SettingsTabs } from '@/components/settings-tabs';
import { SettingsForm } from './settings-form';
import { BusinessLogoUploader } from './business-logo-uploader';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const business = await requireBusiness();

  return (
    <div>
      <PageHeader
        title="Settings"
        icon="cog"
        tone="slate"
        description="Configure your business details and when review requests are sent."
        tabs={<SettingsTabs />}
      />

      <div className="space-y-6">
        <SectionCard title="Business" description="The name customers see on emails and feedback pages.">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="max-w-lg">
              <label htmlFor="name" className="label">Business name</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={business.name}
                form="business-settings-form"
                className="input mt-1.5"
                placeholder="Acme Coffee Co."
              />
            </div>
            <div className="lg:border-l lg:border-line lg:pl-6">
              <BusinessLogoUploader businessName={business.name} logoUrl={business.brand_logo_url} />
            </div>
          </div>
        </SectionCard>

        <SettingsForm business={business} />
      </div>
    </div>
  );
}
