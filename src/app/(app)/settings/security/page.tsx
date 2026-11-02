import Link from 'next/link';
import type { Metadata } from 'next';
import { requireCapability } from '@/lib/business-access';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assessPosture } from '@/lib/security-posture';
import { auditLabel } from '@/lib/activity-feed';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { SettingsTabs } from '@/components/settings-tabs';
import { SegmentedNav } from '@/components/ui/segmented-nav';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icons';
import { ProgressRing } from '@/components/ui/progress-ring';
import { formatUKDateTime } from '@/lib/uk-defaults';
import { RetentionForm } from './retention-form';

export const metadata: Metadata = { title: 'Security & audit' };

const PAGE_SIZE = 50;
const WINDOWS = [30, 90, 365] as const;

export default async function SecurityPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<{ action?: string; page?: string; days?: string }> }) {
  const searchParams = await searchParamsPromise;
  const { business, role } = await requireCapability('team.manage');
  const supabase = createClient();
  const admin = createAdminClient();
  const now = new Date();

  const days = (WINDOWS as readonly number[]).includes(Number(searchParams?.days)) ? Number(searchParams?.days) : 90;
  const page = Math.max(1, Math.min(200, Number.parseInt(searchParams?.page ?? '1', 10) || 1));
  const action = searchParams?.action && /^[a-z_.]{3,60}$/.test(searchParams.action) ? searchParams.action : null;
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  let auditQuery = admin
    .from('audit_log')
    .select('id, action, actor_email, target_type, target_id, metadata, created_at', { count: 'exact' })
    .eq('business_id', business.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (action) auditQuery = auditQuery.eq('action', action);

  const [members, invites, apiKey, webhook, google, audit, recentActions, audit30] = await Promise.all([
    supabase.from('business_members').select('role').eq('business_id', business.id),
    admin.from('team_invitations').select('expires_at').eq('business_id', business.id).is('accepted_at', null).is('revoked_at', null),
    admin.from('api_keys').select('is_active, created_at').eq('business_id', business.id).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('webhook_endpoints').select('is_active, disabled_reason').eq('business_id', business.id).maybeSingle(),
    admin.from('google_business_connections').select('status').eq('business_id', business.id).maybeSingle(),
    auditQuery,
    admin.from('audit_log').select('action').eq('business_id', business.id).gte('created_at', new Date(now.getTime() - 365 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(1000),
    admin.from('audit_log').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since30),
  ]);

  const inviteRows = invites.data ?? [];
  const posture = assessPosture(
    {
      members: (members.data ?? []) as Array<{ role: 'owner' | 'admin' | 'staff' }>,
      pendingInvites: inviteRows.filter((i) => new Date(i.expires_at) > now).length,
      expiredInvites: inviteRows.filter((i) => new Date(i.expires_at) <= now).length,
      apiKey: apiKey.data ? { active: apiKey.data.is_active, createdAt: apiKey.data.created_at } : null,
      webhook: webhook.data ? { active: webhook.data.is_active, disabledReason: webhook.data.disabled_reason } : null,
      retentionDays: business.data_retention_days ?? null,
      hasContactEmail: Boolean(business.contact_email),
      googleStatus: (google.data?.status as 'active' | 'needs_reconnect' | 'pending_location' | undefined) ?? null,
      auditEvents30d: audit30.count ?? 0,
    },
    now
  );

  const actions = [...new Set((recentActions.data ?? []).map((r) => r.action))].sort();
  const total = audit.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (next: { action?: string | null; page?: number; days?: number }) => {
    const p = new URLSearchParams();
    const a = next.action === undefined ? action : next.action;
    const d = next.days ?? days;
    const pg = next.page ?? 1;
    if (a) p.set('action', a);
    if (d !== 90) p.set('days', String(d));
    if (pg > 1) p.set('page', String(pg));
    const qs = p.toString();
    return `/settings/security${qs ? `?${qs}` : ''}`;
  };
  const exportHref = `/api/audit/export?days=${days}${action ? `&action=${encodeURIComponent(action)}` : ''}`;

  return (
    <div>
      <PageHeader
        title="Settings"
        icon="cog"
        tone="slate"
        description="Security posture, data retention and the audit trail for your account."
        tabs={<SettingsTabs />}
      />

      <div className="space-y-6">
        <SectionCard title="Security posture" description="Checked from your current configuration. Fix anything amber for a clean bill of health.">
          <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
            <div className="flex flex-col items-center">
              <ProgressRing percent={posture.score} id="posture" size={132} stroke={12}>
                <span className="text-3xl font-semibold tracking-[-0.04em] text-ink tabular-nums">{posture.score}</span>
                <span className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">posture</span>
              </ProgressRing>
            </div>
            <ul className="divide-y divide-line/70">
              {posture.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                      c.status === 'ok' ? 'bg-brand-500/15 text-brand-700 dark:text-brand-400' : c.status === 'warn' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
                    }`}
                  >
                    <Icon name={c.status === 'ok' ? 'check' : c.status === 'warn' ? 'warning' : 'info'} className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">{c.title}</span>
                    <span className="block text-[13px] leading-5 text-ink-3">{c.detail}</span>
                  </span>
                  {c.href && (
                    <Link href={c.href} className="flex-shrink-0 text-xs font-medium text-brand-700 hover:text-brand-800 dark:text-brand-400">
                      Review
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Data retention" description="How long Pentriq keeps message history, link-click events, webhook and integration logs.">
          <RetentionForm current={business.data_retention_days ?? null} canEdit={can(role, 'account.delete')} />
        </SectionCard>

        <SectionCard
          title="Audit log"
          description="Security-relevant actions on your account: who did what, and when. Append-only; IP addresses are stored only as a hash."
          flush
          action={
            <a href={exportHref} className="btn btn-secondary btn-sm">
              <Icon name="download" className="h-3.5 w-3.5" />
              Export CSV
            </a>
          }
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 sm:px-6">
            <SegmentedNav label="Audit window" active={String(days)} items={WINDOWS.map((d) => ({ key: String(d), label: d === 365 ? '12 months' : `${d} days`, href: href({ days: d }) }))} />
            {actions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={href({ action: null })} className={`rounded-full px-2.5 py-1 text-xs font-medium ${!action ? 'bg-ink text-surface' : 'border border-line-strong text-ink-3 hover:text-ink'}`}>
                  All events
                </Link>
                {actions.map((a) => (
                  <Link key={a} href={href({ action: a })} className={`rounded-full px-2.5 py-1 text-xs font-medium ${action === a ? 'bg-ink text-surface' : 'border border-line-strong text-ink-3 hover:text-ink'}`}>
                    {auditLabel(a)}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {(audit.data ?? []).length === 0 ? (
            <EmptyState icon="shield" title="No events in this window" description="Team changes, exports, API key and webhook changes appear here." className="py-10" />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>By</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit.data ?? []).map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap tabular-nums">{formatUKDateTime(new Date(row.created_at))}</td>
                      <td className="font-medium text-ink">{auditLabel(row.action)}</td>
                      <td className="text-ink-3">{row.actor_email ?? 'System'}</td>
                      <td className="max-w-[320px] truncate text-xs text-ink-4">
                        {Object.entries((row.metadata ?? {}) as Record<string, unknown>)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(' · ') || row.target_type || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-ink-3 sm:px-6">
              <span>
                Page {page} of {pages} · {total.toLocaleString('en-GB')} events
              </span>
              <span className="flex gap-2">
                {page > 1 && <Link href={href({ page: page - 1 })} className="btn btn-secondary btn-sm">Newer</Link>}
                {page < pages && <Link href={href({ page: page + 1 })} className="btn btn-secondary btn-sm">Older</Link>}
              </span>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
