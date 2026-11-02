import { NextResponse, type NextRequest } from 'next/server';
import { requireCapability } from '@/lib/business-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll } from '@/lib/fetch-all';
import { csvCell } from '@/lib/account-export';
import { withinLimit } from '@/lib/rate-limit';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audit/export?days=90&action=team.invited → the business's audit log as CSV (owners and admins).
 * audit_log is server-only, so it is read with the service role and filtered to the caller's business here.
 */
export async function GET(request: NextRequest) {
  const { business, userId, email } = await requireCapability('team.manage');
  if (!(await withinLimit('audit-export', business.id, { limit: 10, windowSeconds: 3600 }))) {
    return NextResponse.json({ error: 'Too many exports. Please try again in an hour.' }, { status: 429 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days'));
  const days = [30, 90, 365].includes(daysParam) ? daysParam : 90;
  const actionParam = request.nextUrl.searchParams.get('action');
  const action = actionParam && /^[a-z_.]{3,60}$/.test(actionParam) ? actionParam : null;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const db = createAdminClient();
  const rows = await fetchAll((from, to) => {
    let q = db
      .from('audit_log')
      .select('created_at, action, actor_email, target_type, target_id, metadata')
      .eq('business_id', business.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (action) q = q.eq('action', action);
    return q;
  });

  await recordAudit({ action: 'audit.exported', businessId: business.id, actorId: userId, actorEmail: email, metadata: { days, rows: rows.length } });

  const header = 'Time (UTC),Action,Actor,Target type,Target id,Details';
  const lines = rows.map((r) =>
    [r.created_at, r.action, r.actor_email, r.target_type, r.target_id, JSON.stringify(r.metadata ?? {})].map(csvCell).join(',')
  );
  const body = `${[header, ...lines].join('\r\n')}\r\n`;
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pentriq-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
