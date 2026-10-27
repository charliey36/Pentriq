/**
 * Subscription pause. A paused business keeps its data and its subscription
 * relationship, but nothing is sent to customers until the pause ends. This is
 * the single place that defines the pause options and "is this business paused".
 */
export const PAUSE_OPTIONS = [
  { key: '1m', label: 'Pause for 1 month', months: 1 },
  { key: '3m', label: 'Pause for 3 months', months: 3 },
  { key: 'indefinite', label: 'Pause until I resume', months: null },
] as const;

export type PauseOptionKey = (typeof PAUSE_OPTIONS)[number]['key'];

export const PAUSED_MESSAGE = 'Your subscription is paused. Resume it in Settings → Billing to keep sending messages.';

export type PauseFields = { paused_at?: string | null; paused_until?: string | null; pause_indefinite?: boolean | null };

export function isPauseOption(value: unknown): value is PauseOptionKey {
  return PAUSE_OPTIONS.some((o) => o.key === value);
}

/** When the pause ends: a date for timed pauses, null for "until I resume". */
export function pauseEnd(option: PauseOptionKey, now = new Date()): Date | null {
  const months = PAUSE_OPTIONS.find((o) => o.key === option)?.months;
  if (!months) return null;
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function isPaused(b: PauseFields, now = new Date()): boolean {
  if (!b.paused_at) return false;
  if (b.pause_indefinite) return true;
  return b.paused_until ? Date.parse(b.paused_until) > now.getTime() : false;
}

/**
 * Rough value shown on the pause screen. It is an ESTIMATE based on customers who
 * followed the review link; the per-review figure is an assumption, so the UI says so.
 */
export const ESTIMATED_VALUE_PER_REVIEW = 25;

export function estimatedValue(customersReached: number): number {
  return Math.max(0, Math.round(customersReached)) * ESTIMATED_VALUE_PER_REVIEW;
}
