import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { SettingsTabs } from '@/components/settings-tabs';
import { SettingsForm } from './settings-form';
import { BusinessLogoUploader } from './business-logo-uploader';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const business = await requireBusiness();
  // Opt-outs (suppression list). Empty if migration 0037 has not been applied yet.
  const { data: suppressed } = await createClient()
    .from('email_suppressions')
    .select('email, created_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(50);

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

        <SectionCard
          title="Opt-outs"
          description="Customers who unsubscribed. They are never contacted again, even if you delete and re-import them. Every email has a one-click unsubscribe link."
        >
          {suppressed && suppressed.length > 0 ? (
            <ul className="divide-y divide-line text-sm">
              {suppressed.map((row) => (
                <li key={row.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-ink-2">{row.email}</span>
                  <span className="text-xs text-ink-3">{new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No one has unsubscribed yet.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
