import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCronAuthorized } from '@/lib/cron-auth';
import { applyRetention } from '@/lib/retention';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Nightly: applies each business's data retention policy (Settings -> Security). Cron-secret protected. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  if (!isCronAuthorized(request, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { data: businesses, error } = await db.from('businesses').select('id, data_retention_days').not('data_retention_days', 'is', null).limit(5000);
  if (error) {
    // Column missing until migration 0044 is applied: nothing to do, not an outage.
    return NextResponse.json({ processed: 0, skipped: 'retention column not available' });
  }

  let processed = 0;
  let deleted = 0;
  let failures = 0;
  for (const business of businesses ?? []) {
    try {
      const r = await applyRetention(db, business as { id: string; data_retention_days: number | null });
      processed += 1;
      deleted += Object.values(r.deleted).reduce((s, n) => s + n, 0);
      if (r.errors.length) {
        failures += 1;
        captureError(new Error(r.errors.join('; ')), { area: 'cron:apply-retention', tags: { business_id: business.id } });
      }
    } catch (e) {
      failures += 1;
      captureError(e, { area: 'cron:apply-retention', tags: { business_id: business.id } });
    }
  }
  return NextResponse.json({ processed, deleted, failures });
}
