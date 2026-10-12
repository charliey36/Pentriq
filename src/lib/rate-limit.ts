import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/click-tracking';

/**
 * Rate limiting for public endpoints (unsubscribe, private feedback,
 * rebooking requests). Counters live in Postgres (`rate_limit_hit`, migration
 * 0024) because serverless instances do not share memory.
 *
 * Fails OPEN: if the limiter itself errors (for example the migration has not
 * been applied yet) the request is allowed and the error is logged. These
 * endpoints include the legally required unsubscribe link, so a limiter outage
 * must never stop a customer opting out.
 */
export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  /** Email security scanners also hit these links, so keep per-IP limits generous. */
  unsubscribeIp: { limit: 30, windowSeconds: 600 },
  feedbackIp: { limit: 10, windowSeconds: 600 },
  feedbackTarget: { limit: 20, windowSeconds: 3600 },
  bookingIp: { limit: 10, windowSeconds: 600 },
  bookingTarget: { limit: 5, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

type RpcCaller = (key: string, windowSeconds: number, limit: number) => Promise<{ data: unknown; error: { message: string } | null }>;

const defaultCaller: RpcCaller = async (key, windowSeconds, limit) => {
  const db = createAdminClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  return db.rpc('rate_limit_hit', { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
};

/** Hash identifiers so raw IP addresses are not stored in the counter table. */
export function limiterKey(scope: string, identifier: string): string {
  return `${scope}:${createHash('sha256').update(identifier).digest('hex').slice(0, 32)}`;
}

/** Returns true if the caller is within the limit (or the limiter is unavailable). */
export async function withinLimit(scope: string, identifier: string, rule: RateLimitRule, call: RpcCaller = defaultCaller): Promise<boolean> {
  try {
    const { data, error } = await call(limiterKey(scope, identifier), rule.windowSeconds, rule.limit);
    if (error) {
      console.error(`[rate-limit] ${scope} check failed, allowing request:`, error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error(`[rate-limit] ${scope} check threw, allowing request:`, e);
    return true;
  }
}

/** Client address for limiting; falls back to a shared bucket when unknown. */
export function requesterId(headers: { get(name: string): string | null }): string {
  return clientIp(headers) ?? 'unknown';
}
