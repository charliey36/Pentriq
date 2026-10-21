import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/components/ui/notice';
import { EmptyState } from '@/components/ui/empty-state';
import { filterActivity, parseRange, parseStatus, type EmailActivityItem } from '@/lib/admin-usage';
import { getRecentEmails } from '@/lib/resend-usage-service';

export const metadata: Metadata = { title: 'Email Activity' };
export const dynamic = 'force-dynamic';

const RANGES = [['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days']] as const;
const STATUSES = [['all', 'All'], ['successful', 'Successful'], ['failed', 'Failed']] as const;
const TONE: Record<EmailActivityItem['status'], 'success' | 'info' | 'danger' | 'neutral'> = { delivered: 'success', sent: 'info', failed: 'danger', other: 'neutral' };

export default async function EmailActivityPage({ searchParams }: { searchParams?: { range?: string; status?: string } }) {
  const range = parseRange(searchParams?.range);
  const status = parseStatus(searchParams?.status);
  const result = await getRecentEmails();
  const items = result.ok ? filterActivity(result.items, range, status).slice(0, 200) : [];
  const href = (r: string, s: string) => `/admin/email-activity?range=${r}&status=${s}`;

  return (
    <div>
      <PageHeader back={{ href: '/admin', label: 'Admin Portal' }} title="Email Activity" icon="inbox" tone="slate" description="Recent emails sent through Resend, so you do not need to open the Resend portal." />
      <SectionCard flush>
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-4">
          {RANGES.map(([value, label]) => <Link key={value} href={href(value, status)} className={`btn btn-sm ${range === value ? 'btn-primary' : 'btn-secondary'}`}>{label}</Link>)}
          <span className="mx-1 hidden w-px bg-line sm:block" aria-hidden="true" />
          {STATUSES.map(([value, label]) => <Link key={value} href={href(range, value)} className={`btn btn-sm ${status === value ? 'btn-primary' : 'btn-secondary'}`}>{label}</Link>)}
        </div>
        {!result.ok ? (
          <div className="p-5"><Notice variant="error">{result.message}</Notice></div>
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="No emails match" description="Try a longer time range or a different status." className="py-10" />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="data-table data-table-hover">
              <thead>
                <tr><th>Timestamp</th><th>Recipient</th><th>Template</th><th>Status</th><th>Message ID</th></tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="whitespace-nowrap">{new Date(i.createdAt).toLocaleString('en-GB')}</td>
                    <td className="text-ink">{i.recipient}</td>
                    <td>{i.template}</td>
                    <td><Badge tone={TONE[i.status]} dot className="capitalize">{i.rawStatus.replace(/_/g, ' ')}</Badge></td>
                    <td><code className="font-mono text-xs text-ink-3">{i.id}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.ok && result.truncated && <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Showing the most recent {result.items.length} emails; older ones are in the Resend portal.</p>}
      </SectionCard>
    </div>
  );
}
