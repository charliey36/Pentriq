import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { httpStatusFor, runHealth, type HealthCheck } from '@/lib/service-health';

export const dynamic = 'force-dynamic';

/**
 * Public health endpoint for uptime monitors and load balancers.
 *   GET /api/health              -> readiness (database reachable)
 *   GET /api/health?mode=live    -> liveness (process only, no dependencies)
 * Returns 503 only when a critical dependency is down. Never exposes secrets or error text.
 */
const checks: HealthCheck[] = [
  {
    name: 'database',
    critical: true,
    run: async () => {
      const { error } = await createAdminClient().from('businesses').select('id', { head: true, count: 'planned' }).limit(1);
      if (error) throw new Error('db');
    },
  },
];

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') === 'live' ? 'live' : 'ready';
  const report = await runHealth(mode, checks, { release: process.env.VERCEL_GIT_COMMIT_SHA || null });
  return NextResponse.json(report, { status: httpStatusFor(report), headers: { 'Cache-Control': 'no-store' } });
}

export async function HEAD(request: NextRequest) {
  const res = await GET(request);
  return new NextResponse(null, { status: res.status, headers: { 'Cache-Control': 'no-store' } });
}
