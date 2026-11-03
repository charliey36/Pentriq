import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Claiming scheduled sends before sending them, so a customer never gets the same email twice.
 *
 * The cron senders (/api/send-messages, /api/send-review-requests) pick up pending rows that are due. Two runs
 * can overlap: Vercel can deliver one cron event more than once, an external scheduler can retry a slow call,
 * and an operator can start a run by hand while one is going. Without a claim, both runs send the same rows.
 *
 * A claim is one conditional UPDATE that moves next_attempt_at forward by a lease, only on rows that are still
 * pending and due. PostgreSQL makes it exclusive: a concurrent claim of the same row waits for the row lock,
 * re-checks its condition against the updated row, and no longer matches. Every outcome of processing a row
 * then overwrites status or next_attempt_at (sent, deferred, cancelled, retry with backoff). A run that dies part
 * way leaves its remaining rows to come due again when the lease ends; a run that runs out of time hands them
 * back straight away (releaseClaims).
 *
 * Email sends also carry an idempotency key per row and attempt, so even the one window a claim cannot close
 * (the provider accepted the email, then the run died before recording it) does not produce a second email:
 * the provider drops a repeat of the same key for 24 hours.
 */

export type SendTable = 'messages' | 'review_requests';

/** How long a claimed row stays invisible to other runs. Far longer than a run (maxDuration 60s). */
export const CLAIM_LEASE_MS = 15 * 60_000;
/** Rows claimed and processed at a time. */
export const SEND_BATCH_SIZE = 25;
/** No new send starts after this long, leaving headroom inside the routes' maxDuration of 60 seconds. */
export const SEND_TIME_BUDGET_MS = 45_000;
/** Hard upper bound on batches per run, whatever the clock says. */
export const MAX_BATCHES_PER_RUN = 20;

type Admin = SupabaseClient<Database>;

/** PostgREST filter for "first attempt, or a retry whose time has come". */
export function dueFilter(nowIso: string): string {
  return `next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`;
}

export type ClaimResult = { ids: Set<string>; leaseUntil: string; error: string | null };

/**
 * Claim the given due rows for this run. Returns the ids this run now owns: rows another run claimed first, or
 * that stopped being due since they were read, are left out.
 */
export async function claimDue(db: Admin, table: SendTable, ids: string[], now: Date = new Date()): Promise<ClaimResult> {
  const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS).toISOString();
  if (ids.length === 0) return { ids: new Set(), leaseUntil, error: null };
  const nowIso = now.toISOString();
  const { data, error } = await db
    .from(table)
    .update({ next_attempt_at: leaseUntil })
    .in('id', ids)
    .eq('status', 'pending')
    .lte('send_at', nowIso)
    .or(dueFilter(nowIso))
    .select('id');
  if (error) return { ids: new Set(), leaseUntil, error: error.message };
  return { ids: new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id)), leaseUntil, error: null };
}

/**
 * Hand claimed rows back unprocessed (the run is out of time), so the next run can send them without waiting
 * for the lease to end. Only rows still pending and still holding this run's lease are touched.
 */
export async function releaseClaims(db: Admin, table: SendTable, ids: string[], leaseUntil: string, dueAt: string): Promise<string | null> {
  if (ids.length === 0) return null;
  const { error } = await db
    .from(table)
    .update({ next_attempt_at: dueAt })
    .in('id', ids)
    .eq('status', 'pending')
    .eq('next_attempt_at', leaseUntil);
  return error ? error.message : null;
}

/**
 * Idempotency key for one send attempt of one row. Repeats of the same attempt are dropped by the email provider
 * for 24 hours; a genuine retry after a recorded failure has a new attempt number, so it is not.
 */
export function sendIdempotencyKey(table: SendTable, id: string, attempt: number): string {
  return `pentriq/${table}/${id}/${attempt}`;
}

/** Wall-clock budget for one run. */
export function runBudget(budgetMs: number = SEND_TIME_BUDGET_MS, clock: () => number = Date.now) {
  const startedAt = clock();
  return { startedAt, outOfTime: () => clock() - startedAt >= budgetMs };
}
