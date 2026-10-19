import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';

export const metadata: Metadata = { title: 'Email Settings' };

export default async function EmailSettingsPage() {
  await requireBusiness();

  return (
    <div>
      <PageHeader
        title="Email Configuration"
        icon="mail"
        tone="slate"
        description="Manage how Pentriq sends email to your customers."
        back={{ href: '/settings', label: 'Settings' }}
      />

      <div className="space-y-6">
        <SectionCard
          title="Review email design"
          description="Preview the branded review request and reminder emails exactly as customers will see them, on desktop and mobile."
          action={
            <Link href="/settings/email/preview" className="btn btn-secondary btn-sm">
              Preview emails
            </Link>
          }
        >
          <p className="text-sm text-ink-3">
            Try different customer names, business names and review links, or simulate missing values to
            check the fallbacks.
          </p>
        </SectionCard>

        <SectionCard
          title="Getting Started"
          description="Follow these steps to set up production email sending."
        >
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold text-ink">Currently in Sandbox Mode</h4>
              <p className="mt-1 text-ink-2">
                Your Resend account is in sandbox mode, which means emails can only be sent to the verified owner email address. This is perfect for testing before you go live.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-ink">To Send Emails to Customers</h4>
              <ol className="mt-2 space-y-2 list-decimal list-inside text-ink-2">
                <li>
                  Go to{' '}
                  <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                    resend.com/domains
                  </a>
                </li>
                <li>Click "Add Domain" and follow Resend's verification process</li>
                <li>Once verified, update the EMAIL_FROM environment variable to use your domain</li>
                <li>Restart Pentriq, and emails will begin sending in production mode</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold text-ink">Environment Variables</h4>
              <div className="mt-2 rounded bg-surface-muted p-3 font-mono text-xs">
                <code>EMAIL_FROM=noreply@yourdomain.com</code>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
