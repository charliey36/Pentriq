/**
 * Structured, privacy-safe logging. One JSON line per event so logs can be searched by
 * `area` + `event` (e.g. area=email event=send_failed) and root causes read from `reason`.
 * Email addresses are masked and secrets/tokens are never logged.
 */
export type LogArea = 'import' | 'email' | 'referral' | 'review_request' | 'rebooking' | 'auth' | 'settings' | 'db' | 'security';

export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1) return value ? '***' : '';
  return `${value[0]}***${value.slice(at)}`;
}

const SENSITIVE_KEY = /token|secret|password|authorization|api[_-]?key|cookie/i;

function clean(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) continue;
    out[key] = /^(to|email|recipient)$/i.test(key) && typeof value === 'string' ? maskEmail(value) : value;
  }
  return out;
}

export function errorReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

export function logEvent(area: LogArea, event: string, fields: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info') {
  const line = JSON.stringify({ area, event, level, ...clean(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * For server actions: logs the full technical error and returns a friendly message that is safe
 * to show a non-technical user (no database or provider wording).
 */
export function userSafeError(action: string, error: unknown, area: LogArea = 'db'): string {
  logEvent(area, 'action_failed', { action, reason: errorReason(error) }, 'error');
  return `${action}. Please try again, and contact support if it keeps happening.`;
}
