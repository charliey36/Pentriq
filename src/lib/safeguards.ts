/**
 * Customer communication safeguards shared by every path that creates review
 * requests (CSV import, manual visit logging) and by the unsubscribe endpoint:
 *   - suppression list (opt-outs that survive customer deletion / re-import)
 *   - blocked-request counters shown on the dashboard
 *   - the frequency (cooldown) options offered in Settings
 *
 * Writes here are best-effort and never throw: a safeguard bookkeeping failure
 * (e.g. migration 0037 not applied yet) must not break an import or a send.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Db = SupabaseClient<Database>;
export type BlockReason = 'frequency' | 'opt_out' | 'duplicate';

export const BLOCK_LABELS: Record<BlockReason, string> = {
  frequency: 'Blocked by frequency rules',
  opt_out: 'Blocked by opt-out',
  duplicate: 'Blocked as duplicates',
};

export const FREQUENCY_PRESETS = [30, 60, 90] as const;
export const FREQUENCY_DEFAULT_DAYS = 30;

/** Settings dropdown value for a stored day count: a preset, or 'custom'. */
export function frequencyChoice(days: number | null | undefined): string {
  return (FREQUENCY_PRESETS as readonly number[]).includes(days ?? -1) ? String(days) : 'custom';
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function recordBlocks(
  supabase: Db,
  businessId: string,
  blocks: Array<{ customerId?: string | null; reason: BlockReason }>
): Promise<void> {
  if (blocks.length === 0) return;
  try {
    await supabase
      .from('review_request_blocks')
      .insert(blocks.map((b) => ({ business_id: businessId, customer_id: b.customerId ?? null, reason: b.reason })));
  } catch {
    // Counters are informational only.
  }
}

/** Emails this business must never contact again (lower-cased). Empty on any error. */
export async function suppressedEmails(supabase: Db, businessId: string, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const unique = [...new Set(emails.map(normalizeEmail))];
  try {
    for (let i = 0; i < unique.length; i += 100) {
      const { data } = await supabase
        .from('email_suppressions')
        .select('email')
        .eq('business_id', businessId)
        .in('email', unique.slice(i, i + 100));
      (data ?? []).forEach((r) => out.add(r.email));
    }
  } catch {
    // Table missing (migration pending): fall back to customers.unsubscribed_at only.
  }
  return out;
}

export async function addSuppression(supabase: Db, businessId: string, email: string, reason = 'unsubscribed'): Promise<void> {
  try {
    await supabase
      .from('email_suppressions')
      .upsert({ business_id: businessId, email: normalizeEmail(email), reason }, { onConflict: 'business_id,email', ignoreDuplicates: true });
  } catch {
    // Best effort; customers.unsubscribed_at remains the enforcement point.
  }
}
