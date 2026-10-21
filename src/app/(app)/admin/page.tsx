import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Icon } from '@/components/ui/icons';
import { ADMIN_SECTIONS } from '@/lib/admin-sections';
import { getUsageSummary } from '@/lib/resend-usage-service';
import { EmailUsageLive } from './email-usage-live';

export const metadata: Metadata = { title: 'Admin Portal' };
export const dynamic = 'force-dynamic';

export default async function AdminPortalPage() {
  const usage = await getUsageSummary();

  return (
    <div>
      <PageHeader title="Admin Portal" icon="shield" tone="slate" description="Operational tools for Pentriq administrators. Not visible to business users." />

      <SectionCard
        title="Email Usage Summary"
        description="Resend consumption, updated as emails are sent."
        action={<Link href="/admin/email-usage" className="btn btn-secondary btn-sm">Details</Link>}
      >
        <EmailUsageLive initial={usage} compact />
      </SectionCard>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.map((section) => {
          const body = (
            <>
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon name={section.icon} className="h-4 w-4 text-ink-3" />
                {section.title}
                {!section.href && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-3">Coming soon</span>}
              </span>
              <span className="mt-1 block text-xs text-ink-3">{section.description}</span>
            </>
          );
          return (
            <li key={section.key}>
              {section.href ? (
                <Link href={section.href} className="card block px-5 py-4 hover:bg-surface-muted">{body}</Link>
              ) : (
                <div className="card block px-5 py-4 opacity-60" aria-disabled="true">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
