/**
 * resend-usage-service: server-side only. Talks to the Resend API with RESEND_API_KEY (never sent
 * to the browser) and returns clean, typed results for the Admin Portal.
 *
 *  - getUsageSummary / getDailyUsage / getMonthlyUsage -> GET https://api.resend.com/usage
 *    (needs a FULL ACCESS API key; a sending-only key gets 401/403, handled below).
 *  - getRecentEmails -> GET https://api.resend.com/emails (paginated).
 *
 * If the Usage API is unavailable, usage falls back to an estimate from Pentriq's own send log,
 * clearly marked `source: 'pentriq_log'`. Limits then come from RESEND_DAILY_LIMIT /
 * RESEND_MONTHLY_LIMIT if set, otherwise they are unknown (null) rather than invented.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { errorReason, logEvent } from '@/lib/log';
import { fromWindows, parseResendEmail, parseResendUsage, toWindow, type EmailActivityItem, type UsageResult, type UsageSummary } from '@/lib/admin-usage';

const API = 'https://api.resend.com';
const TIMEOUT_MS = 8000;

async function resendGet(path: string): Promise<{ status: number; body: unknown }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON error body */
  }
  return { status: response.status, body };
}

function envLimit(name: string): number | null {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Estimate from Pentriq's own `messages` table (successful sends only). */
async function usageFromLog(): Promise<UsageSummary | null> {
  try {
    const db = createAdminClient();
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const count = async (since: string) => {
      const { count: c, error } = await db.from('messages').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'sent').gte('sent_at', since);
      if (error) throw error;
      return c ?? 0;
    };
    const [today, month] = await Promise.all([count(startOfDay), count(startOfMonth)]);
    return fromWindows(toWindow(today, envLimit('RESEND_DAILY_LIMIT')), toWindow(month, envLimit('RESEND_MONTHLY_LIMIT')), 'pentriq_log', now);
  } catch (e) {
    logEvent('email', 'usage_log_fallback_failed', { reason: errorReason(e) }, 'warn');
    return null;
  }
}

export async function getUsageSummary(): Promise<UsageResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, reason: 'not_configured', message: 'RESEND_API_KEY is not set, so Resend cannot be reached.' };
  }
  let failure: { reason: 'forbidden' | 'error'; message: string };
  try {
    const { status, body } = await resendGet('/usage');
    if (status === 200) {
      const usage = parseResendUsage(body);
      if (usage) return { ok: true, usage };
      failure = { reason: 'error', message: 'Resend returned usage data in an unexpected format.' };
    } else if (status === 401 || status === 403) {
      failure = { reason: 'forbidden', message: 'Resend refused the usage request. The Usage API needs a full-access API key (the current key may be sending-only).' };
    } else {
      failure = { reason: 'error', message: `Resend usage request failed (HTTP ${status}).` };
    }
  } catch (e) {
    failure = { reason: 'error', message: 'Could not reach Resend. Try again shortly.' };
    logEvent('email', 'usage_fetch_failed', { reason: errorReason(e) }, 'error');
  }
  logEvent('email', 'usage_unavailable', { reason: failure.message }, 'warn');
  const estimate = await usageFromLog();
  return estimate ? { ok: true, usage: estimate } : { ok: false, ...failure };
}

export async function getDailyUsage() {
  const r = await getUsageSummary();
  return r.ok ? { ok: true as const, sent: r.usage.emailsSentToday, limit: r.usage.dailyLimit, remaining: r.usage.dailyRemaining, percentage: r.usage.dailyPercentage } : r;
}

export async function getMonthlyUsage() {
  const r = await getUsageSummary();
  return r.ok ? { ok: true as const, sent: r.usage.emailsSentThisMonth, limit: r.usage.monthlyLimit, remaining: r.usage.monthlyRemaining, percentage: r.usage.monthlyPercentage } : r;
}

export type ActivityResult =
  | { ok: true; items: EmailActivityItem[]; truncated: boolean }
  | { ok: false; reason: 'not_configured' | 'forbidden' | 'error'; message: string };

/** Recent sends from Resend, newest first. Reads up to `maxPages` x 100 emails. */
export async function getRecentEmails(maxPages = 5): Promise<ActivityResult> {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: 'not_configured', message: 'RESEND_API_KEY is not set.' };
  const items: EmailActivityItem[] = [];
  let after: string | null = null;
  let hasMore = false;
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const { status, body } = await resendGet(`/emails?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      if (status === 401 || status === 403) {
        return { ok: false, reason: 'forbidden', message: 'Resend refused the request. Listing sent emails needs a full-access API key.' };
      }
      if (status !== 200) return { ok: false, reason: 'error', message: `Resend returned HTTP ${status} while listing emails.` };
      const list = body as { data?: Array<Record<string, unknown>>; has_more?: boolean };
      const rows = Array.isArray(list.data) ? list.data : [];
      rows.forEach((r) => {
        const item = parseResendEmail(r);
        if (item) items.push(item);
      });
      hasMore = Boolean(list.has_more) && rows.length > 0;
      if (!hasMore) break;
      after = typeof rows[rows.length - 1]?.id === 'string' ? (rows[rows.length - 1].id as string) : null;
      if (!after) break;
    }
    return { ok: true, items, truncated: hasMore };
  } catch (e) {
    logEvent('email', 'activity_fetch_failed', { reason: errorReason(e) }, 'error');
    return { ok: false, reason: 'error', message: 'Could not reach Resend. Try again shortly.' };
  }
}
