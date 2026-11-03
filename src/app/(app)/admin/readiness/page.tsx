import type { Metadata } from 'next';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateConfig, MIGRATION_SENTINELS, SEND_OVERDUE_HOURS, sendBacklogCheck, summarise, type ReadinessCheck } from '@/lib/launch-readiness';
import { dueFilter } from '@/lib/send-claim';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Icon } from '@/components/ui/icons';

export const metadata: Metadata = { title: 'Launch readiness' };
export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<ReadinessCheck['status'], { icon: 'check' | 'warning' | 'x'; tone: string; label: string }> = {
  ok: { icon: 'check', tone: 'bg-brand-500/15 text-brand-700 dark:text-brand-400', label: 'Ready' },
  warn: { icon: 'warning', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'Check' },
  fail: { icon: 'x', tone: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Blocker' },
};

/** Manual items no code can verify; listed so the go-live checklist is complete in one place. */
const HUMAN_ITEMS = [
  'Terms, privacy and cookie policies reviewed by a solicitor (the current text is a draft).',
  'Data processing agreement available for business customers (UK GDPR Article 28).',
  'Processing regions confirmed for Supabase, Vercel, Resend and Stripe, and added to /subprocessors.',
  'Google Business Profile API access approved by Google, then GOOGLE_BUSINESS_API_APPROVED=true.',
  'Uptime monitor on /api/health alerting someone out of hours.',
  'Send jobs called every 5 minutes (Vercel Pro cron or an external scheduler); vercel.json runs them once a day.',
  'Content Security Policy promoted from report-only to enforcing after a week of clean violation reports.',
];

async function databaseChecks(): Promise<ReadinessCheck[]> {
  const out: ReadinessCheck[] = [];
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return [{ id: 'db', area: 'Database', label: 'Database reachable', severity: 'blocker', status: 'fail', detail: 'The service client could not be created (Supabase variables missing).' }];
  }

  const ping = await admin.from('businesses').select('id', { count: 'exact', head: true });
  out.push({
    id: 'db', area: 'Database', label: 'Database reachable', severity: 'blocker',
    status: ping.error ? 'fail' : 'ok',
    detail: ping.error ? 'The database did not answer. Check the Supabase project and keys.' : `${(ping.count ?? 0).toLocaleString('en-GB')} businesses.`,
  });
  if (ping.error) return out;

  const probes = await Promise.all(
    MIGRATION_SENTINELS.map(async (m) => {
      const { error } = await (admin as unknown as { from(t: string): { select(c: string): { limit(n: number): PromiseLike<{ error: { message: string } | null }> } } })
        .from(m.table)
        .select(m.column)
        .limit(1);
      return { ...m, applied: !error };
    })
  );
  for (const p of probes) {
    out.push({
      id: `migration-${p.migration}`, area: 'Database', label: `Migration ${p.migration}`, severity: 'blocker',
      status: p.applied ? 'ok' : 'fail',
      detail: p.applied ? p.feature : `Not applied: run supabase/migrations/${p.migration}_*.sql. Needed for: ${p.feature}.`,
    });
  }

  const rls = await admin.rpc('rls_status');
  if (rls.error) {
    out.push({ id: 'rls', area: 'Database', label: 'Row-level security on every table', severity: 'blocker', status: 'warn', detail: 'Could not run the live check (apply migration 0045). The CI database job verifies it on every change.' });
  } else {
    const rows = (rls.data ?? []) as Array<{ table_name: string; rls_enabled: boolean }>;
    const off = rows.filter((r) => !r.rls_enabled).map((r) => r.table_name);
    out.push({
      id: 'rls', area: 'Database', label: 'Row-level security on every table', severity: 'blocker',
      status: off.length ? 'fail' : 'ok',
      detail: off.length ? `Not protected: ${off.join(', ')}.` : `All ${rows.length} tables protected, checked live just now.`,
    });
  }

  const nowIso = new Date().toISOString();
  const overdueBefore = new Date(Date.now() - SEND_OVERDUE_HOURS * 3_600_000).toISOString();
  const [overdueMessages, overdueRequests] = await Promise.all(
    (['messages', 'review_requests'] as const).map((table) =>
      admin.from(table).select('id', { count: 'exact', head: true }).eq('status', 'pending').lte('send_at', overdueBefore).or(dueFilter(nowIso))
    )
  );
  out.push(sendBacklogCheck(overdueMessages.error || overdueRequests.error ? null : (overdueMessages.count ?? 0) + (overdueRequests.count ?? 0)));

  const ledger = await admin.from('schema_migrations').select('version').order('version', { ascending: false }).limit(1);
  if (!ledger.error) {
    out.push({ id: 'ledger', area: 'Database', label: 'Latest recorded migration', severity: 'optional', status: 'ok', detail: ledger.data?.[0]?.version ?? 'None recorded yet.' });
  }
  return out;
}

export default async function ReadinessPage() {
  const config = evaluateConfig(process.env);
  const db = await databaseChecks();
  const all = [...db, ...config];
  const summary = summarise(all);
  const areas = [...new Set(all.map((c) => c.area))];

  return (
    <div>
      <PageHeader
        back={{ href: '/admin', label: 'Admin Portal' }}
        title="Launch readiness"
        icon="target"
        tone={summary.ready ? 'emerald' : 'rose'}
        description="Live checks of this deployment's configuration and database. Values are never shown, only whether each item is in place."
      />

      <div className={`mb-6 flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4 ${summary.ready ? 'border-brand-500/30 bg-brand-500/[0.06]' : 'border-red-500/30 bg-red-500/[0.05]'}`}>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${summary.ready ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'bg-red-500/15 text-red-700 dark:text-red-300'}`}>
          <Icon name={summary.ready ? 'checkCircle' : 'warning'} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">
            {summary.ready ? 'No technical blockers' : `${summary.blockers} blocker${summary.blockers === 1 ? '' : 's'} before taking real customers`}
          </p>
          <p className="text-[13px] text-ink-3">
            {summary.ok} ready · {summary.warnings} to check · plus the manual items below
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {areas.map((area) => (
          <SectionCard key={area} title={area} flush>
            <ul className="divide-y divide-line/70">
              {all.filter((c) => c.area === area).map((c) => {
                const s = STATUS_STYLE[c.status];
                return (
                  <li key={c.id} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
                    <span className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${s.tone}`}>
                      <Icon name={s.icon} className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink">
                        {c.label}
                        <span className="rounded-full bg-surface-muted px-2 py-px text-2xs font-medium capitalize text-ink-3">{c.severity}</span>
                      </span>
                      <span className="block text-[13px] leading-5 text-ink-3">{c.detail}</span>
                    </span>
                    <span className="sr-only">{s.label}</span>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        ))}

        <SectionCard title="Manual items" description="Decisions and reviews no code can make. Tick them off outside Pentriq.">
          <ul className="space-y-2.5">
            {HUMAN_ITEMS.map((item) => (
              <li key={item} className="flex gap-2.5 text-[13px] leading-5 text-ink-2">
                <Icon name="flag" className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-4" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-4">
            Details and reasoning: docs/RELEASE_READINESS.md. Health endpoint for uptime monitors: <Link href="/api/health" className="underline">/api/health</Link>.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
