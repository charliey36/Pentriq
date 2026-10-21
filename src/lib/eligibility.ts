import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

const DAY_MS = 86_400_000;

/** Whole days between a YYYY-MM-DD service date and today (UTC). */
export function daysSinceService(lastServiceDate: string | null | undefined, now = new Date()): number | null {
  if (!lastServiceDate) return null;
  const t = Date.parse(`${lastServiceDate}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - t) / DAY_MS);
}

/** Eligible for a review request: serviced within the last `windowDays` days. */
export function isReviewEligible(lastServiceDate: string | null | undefined, windowDays: number): boolean {
  const days = daysSinceService(lastServiceDate);
  return days !== null && days >= 0 && days <= windowDays;
}

/** Eligible for a rebooking reminder: `intervalDays` or more days since service. */
export function isRebookingEligible(lastServiceDate: string | null | undefined, intervalDays: number): boolean {
  const days = daysSinceService(lastServiceDate);
  return days !== null && days >= intervalDays;
}

/**
 * Review request cooldown. True when the last review request was sent fewer
 * than `cooldownDays` days before `referenceDate` (the new service date), so a
 * new request should be suppressed. 60-day cooldown, sent 1 Jan: 20 Jan and
 * 15 Feb are blocked, 10 Mar (68 days later) is allowed.
 */
export function isCooldownActive(
  lastSentAt: string | null | undefined,
  cooldownDays: number,
  referenceDate: string = todayIso()
): boolean {
  if (!lastSentAt) return false;
  const sent = Date.parse(lastSentAt);
  const ref = Date.parse(`${referenceDate}T00:00:00Z`);
  if (Number.isNaN(sent) || Number.isNaN(ref)) return false;
  return Math.floor(ref / DAY_MS) - Math.floor(sent / DAY_MS) < cooldownDays;
}

/** The business's cooldown in days, or null when the cooldown is off (the default). */
export function cooldownDaysFor(business: { review_cooldown_enabled?: boolean | null; review_cooldown_days?: number | null }): number | null {
  return business.review_cooldown_enabled ? business.review_cooldown_days ?? 60 : null;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Parses YYYY-MM-DD or DD/MM/YYYY into YYYY-MM-DD; null if invalid. */
export function parseServiceDate(raw: string): string | null {
  const v = raw.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : v;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Schedules the review request for a customer who has just received a service:
 * enrolled in the review_sequence journey (initial request + day-3 / day-7
 * reminders) with the first send at 08:00 the next day (UK time). Skips if a
 * request is already queued or scheduled.
 *
 * Thin wrapper over the shared scheduling engine (see
 * `@/lib/review-scheduling`) so this legacy entry point and the newer manual
 * visit-logging / manual-send flows all schedule reviews the same way.
 */
export async function scheduleReviewRequest(
  supabase: SupabaseClient<Database>,
  businessId: string,
  _delayHours: number,
  customerId: string,
  serviceDate: string = todayIso()
) {
  const { extractReviewSchedulingLogic } = await import('@/lib/review-scheduling');
  await extractReviewSchedulingLogic(supabase, businessId, customerId, {
    serviceDate,
    autoSend: true,
  });
}

/** Parses "350", "£1,250.50" etc. Empty = 0. Returns null if not a valid non-negative number. */
export function parseAmount(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[£$€,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : null;
}
