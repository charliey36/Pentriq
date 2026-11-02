import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuthUser, isAdminEmail, requireBusiness } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';

export const metadata: Metadata = { title: 'Audit logs' };
export const dynamic = 'force-dynamic';

type Row = { id: number; created_at: string; action: string; actor_email: string | null; actor_id: string | null; business_id: string | null; target_type: string | null; target_id: string | null; metadata: Record<string, unknown> };

export default async function AuditLogsPage({ searchParams }: { searchParams: { action?: string } }) {
  await requireBusiness();
  const user = await getAuthUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  let q = (createAdminClient() as unknown as { from(t: string): { select(c: string): { order(c: string, o: { ascending: boolean }): { limit(n: number): { eq(c: string, v: string): PromiseLike<{ data: Row[] | null }> } & PromiseLike<{ data: Row[] | null }> } } } })
    .from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
  const action = searchParams.action?.slice(0, 60);
  const { data } = await (action ? q.eq('action', action) : q);
  const rows = data ?? [];

  return (
    <div>
      <PageHeader title="Audit logs" icon="clock" tone="slate" description="Security-relevant actions across all businesses, newest first (latest 200). Ids and counts only; no customer data." />
      <SectionCard title={`Events (${rows.length})`} flush>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-3">When (UTC)</th><th className="p-3">Action</th><th className="p-3">Actor</th><th className="p-3">Business</th><th className="p-3">Target</th><th className="p-3">Details</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="whitespace-nowrap p-3">{r.created_at.slice(0, 19).replace('T', ' ')}</td>
                    <td className="p-3 font-medium">{r.action}</td>
                    <td className="p-3">{r.actor_email ?? r.actor_id ?? '-'}</td>
                    <td className="p-3 font-mono text-xs">{r.business_id ?? '-'}</td>
                    <td className="p-3 font-mono text-xs">{r.target_type ? `${r.target_type}:${r.target_id ?? ''}` : '-'}</td>
                    <td className="p-3 font-mono text-xs">{Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
