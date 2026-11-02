/**
 * Data retention policy (GDPR storage limitation): a business can choose how long Pentriq keeps message
 * history and tracking events. Core records the business needs to operate (customers, visits, private
 * feedback, loyalty ledger, audit log) are never purged by this job; deleting those is a deliberate,
 * separate action (account deletion or per-customer archive).
 *
 * Messages are only removed once they are finished (sent, failed or cancelled); anything still queued or
 * pending is kept whatever its age. Deleting a message cascades to its interaction events and clears the
 * link on any private feedback (foreign keys in schema.sql), so nothing is left dangling.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const RETENTION_OPTIONS: Array<{ days: number | null; label: string }> = [
  { days: null, label: 'Keep everything' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
  { days: 730, label: '2 years' },
  { days: 1095, label: '3 years' },
];

export const MIN_RETENTION_DAYS = 90;
export const MAX_RETENTION_DAYS = 3650;

type Target = { table: string; column: string; finishedOnly?: boolean };

/** Order matters: children before parents keeps each delete small (cascades would do it, but slower). */
export const RETENTION_TARGETS: Target[] = [
  { table: 'interaction_events', column: 'occurred_at' },
  { table: 'click_events', column: 'clicked_at' },
  { table: 'messages', column: 'created_at', finishedOnly: true },
  { table: 'webhook_deliveries', column: 'created_at' },
  { table: 'integration_events', column: 'created_at' },
];

export function parseRetentionDays(raw: unknown): { ok: true; days: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '' || raw === 'keep') return { ok: true, days: null };
  const days = Number(raw);
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
    return { ok: false, error: `Choose between ${MIN_RETENTION_DAYS} days and ${Math.round(MAX_RETENTION_DAYS / 365)} years, or keep everything.` };
  }
  return { ok: true, days };
}

export function retentionCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function describeRetention(days: number | null): string {
  if (days === null) return 'Message history and tracking events are kept until you delete your account.';
  const label = RETENTION_OPTIONS.find((o) => o.days === days)?.label ?? `${days} days`;
  return `Message history and tracking events older than ${label.toLowerCase()} are deleted automatically each night.`;
}

export type RetentionResult = { businessId: string; deleted: Record<string, number>; errors: string[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

export async function applyRetention(db: AnyDb, business: { id: string; data_retention_days: number | null }, now: Date = new Date()): Promise<RetentionResult> {
  const result: RetentionResult = { businessId: business.id, deleted: {}, errors: [] };
  const parsed = parseRetentionDays(business.data_retention_days);
  if (!parsed.ok || parsed.days === null) return result;
  const cutoff = retentionCutoff(parsed.days, now);

  for (const target of RETENTION_TARGETS) {
    try {
      let q = db.from(target.table).delete({ count: 'exact' }).eq('business_id', business.id).lt(target.column, cutoff);
      if (target.finishedOnly) q = q.in('status', ['sent', 'failed', 'cancelled']);
      const { count, error } = await q;
      if (error) result.errors.push(`${target.table}: ${error.message}`);
      else result.deleted[target.table] = count ?? 0;
    } catch (e) {
      result.errors.push(`${target.table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
