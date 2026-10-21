import type { Metadata } from 'next';
import Link from 'next/link';
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

      <SectionCard
        className="mt-6"
        title="Review email design"
        description="Preview the branded review request and reminder emails exactly as customers see them."
        action={<Link href="/admin/email-preview" className="btn btn-secondary btn-sm">Preview emails</Link>}
      >
        <p className="text-sm text-ink-3">Try different customer names, business names and review links, or simulate missing values to check the fallbacks.</p>
      </SectionCard>

      <SectionCard className="mt-6" title="Sending setup" description="What to do to send email from your own domain.">
        <ol className="list-inside list-decimal space-y-2 text-sm text-ink-2">
          <li>Go to <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">resend.com/domains</a> and add your domain.</li>
          <li>Complete Resend&apos;s verification steps.</li>
          <li>Set the <code className="font-mono text-xs">EMAIL_FROM</code> environment variable to an address on that domain (for example <code className="font-mono text-xs">noreply@yourdomain.com</code>) and redeploy.</li>
        </ol>
        <p className="mt-3 text-xs text-ink-4">Until a domain is verified, Resend only delivers to the account owner&apos;s address.</p>
      </SectionCard>
    </div>
  );
}
