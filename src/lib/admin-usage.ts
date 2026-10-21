/**
 * Pure helpers for the Admin Portal email monitoring pages: parsing Resend's responses, usage
 * percentages and status colours, warning banners, and activity-log filtering. No I/O.
 */

export type UsageWindow = { used: number; limit: number | null; remaining: number | null; percentage: number | null; resetsAt: string | null };

export type UsageSummary = {
  emailsSentToday: number;
  dailyLimit: number | null;
  dailyRemaining: number | null;
  dailyPercentage: number | null;
  emailsSentThisMonth: number;
  monthlyLimit: number | null;
  monthlyRemaining: number | null;
  monthlyPercentage: number | null;
  dailyResetsAt: string | null;
  monthlyResetsAt: string | null;
  /** 'resend' = live from the Resend Usage API; 'pentriq_log' = estimate from Pentriq's own send log. */
  source: 'resend' | 'pentriq_log';
  fetchedAt: string;
};

export type UsageResult =
  | { ok: true; usage: UsageSummary }
  | { ok: false; reason: 'not_configured' | 'forbidden' | 'error'; message: string };

export function toWindow(used: number, limit: number | null, resetsAt: string | null = null): UsageWindow {
  const safeUsed = Math.max(0, Math.round(Number.isFinite(used) ? used : 0));
  const hasLimit = typeof limit === 'number' && Number.isFinite(limit) && limit > 0;
  return {
    used: safeUsed,
    limit: hasLimit ? limit : null,
    remaining: hasLimit ? Math.max(0, limit - safeUsed) : null,
    percentage: hasLimit ? Math.min(100, Math.round((safeUsed / limit) * 1000) / 10) : null,
    resetsAt,
  };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Maps the body of `GET https://api.resend.com/usage` to a UsageSummary; null if the shape is unexpected. */
export function parseResendUsage(body: unknown, now = new Date()): UsageSummary | null {
  const emails = (body as { emails?: { daily?: Record<string, unknown>; monthly?: Record<string, unknown> } } | null)?.emails;
  if (!emails?.monthly) return null;
  const daily = emails.daily ?? null;
  const d = toWindow(num(daily?.used) ?? 0, daily ? num(daily.limit) : null, typeof daily?.resets_at === 'string' ? daily.resets_at : null);
  const m = toWindow(num(emails.monthly.used) ?? 0, num(emails.monthly.limit), typeof emails.monthly.resets_at === 'string' ? emails.monthly.resets_at : null);
  return fromWindows(d, m, 'resend', now);
}

export function fromWindows(d: UsageWindow, m: UsageWindow, source: UsageSummary['source'], now = new Date()): UsageSummary {
  return {
    emailsSentToday: d.used,
    dailyLimit: d.limit,
    dailyRemaining: d.remaining,
    dailyPercentage: d.percentage,
    emailsSentThisMonth: m.used,
    monthlyLimit: m.limit,
    monthlyRemaining: m.remaining,
    monthlyPercentage: m.percentage,
    dailyResetsAt: d.resetsAt,
    monthlyResetsAt: m.resetsAt,
    source,
    fetchedAt: now.toISOString(),
  };
}

export type UsageTone = 'green' | 'amber' | 'red' | 'grey';

/** Green under 70%, amber 70-90%, red 90%+. Grey when there is no limit to measure against. */
export function usageTone(percentage: number | null): UsageTone {
  if (percentage === null) return 'grey';
  if (percentage >= 90) return 'red';
  if (percentage >= 70) return 'amber';
  return 'green';
}

export function usageWarnings(u: Pick<UsageSummary, 'dailyPercentage' | 'monthlyPercentage'>): Array<{ level: 'warning' | 'critical'; message: string }> {
  const out: Array<{ level: 'warning' | 'critical'; message: string }> = [];
  const check = (pct: number | null, label: 'Daily' | 'Monthly') => {
    if (pct === null) return;
    if (pct >= 95) out.push({ level: 'critical', message: `Critical: ${label} email limit almost exhausted.` });
    else if (pct >= 80) out.push({ level: 'warning', message: `Warning: ${label} email limit above 80%.` });
  };
  check(u.dailyPercentage, 'Daily');
  check(u.monthlyPercentage, 'Monthly');
  return out;
}

// ---------------------------------------------------------------- activity log

export type EmailActivityItem = {
  id: string;
  createdAt: string;
  recipient: string;
  subject: string;
  template: string;
  status: 'delivered' | 'sent' | 'failed' | 'other';
  rawStatus: string;
};

export const ACTIVITY_RANGES = ['today', '7d', '30d'] as const;
export const ACTIVITY_STATUSES = ['all', 'successful', 'failed'] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Best-effort label for which Pentriq email this was, from its subject line. */
export function classifyEmail(subject: string | null | undefined): string {
  const s = (subject ?? '').toLowerCase();
  if (s.startsWith('welcome to')) return 'Welcome';
  if (s.includes('refer a friend') || s.includes('referral')) return 'Referral';
  if (s.includes('trial')) return 'Trial';
  if (s.includes('campaign has been sent')) return 'Campaign sent';
  if (s.includes('rebook') || s.includes('book again') || s.includes("it's time") || s.includes('time for your next')) return 'Rebooking reminder';
  if (s.includes('review') || s.includes('feedback') || s.includes('how was')) return 'Review request';
  if (s.includes('rating') || s.includes('1-star') || s.includes('alert')) return 'Review alert';
  return 'Other';
}

export function normalizeStatus(lastEvent: string | null | undefined): Pick<EmailActivityItem, 'status' | 'rawStatus'> {
  const raw = (lastEvent ?? 'unknown').toLowerCase();
  if (['bounced', 'complained', 'failed', 'suppressed', 'canceled', 'cancelled'].includes(raw)) return { status: 'failed', rawStatus: raw };
  if (['delivered', 'opened', 'clicked'].includes(raw)) return { status: 'delivered', rawStatus: raw };
  if (['sent', 'queued', 'scheduled', 'delivery_delayed'].includes(raw)) return { status: 'sent', rawStatus: raw };
  return { status: 'other', rawStatus: raw };
}

/** Maps one item from Resend's `GET /emails` list. Tolerates missing fields. */
export function parseResendEmail(raw: Record<string, unknown>): EmailActivityItem | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  const createdAt = typeof raw.created_at === 'string' ? raw.created_at : null;
  if (!id || !createdAt) return null;
  const parsed = Date.parse(createdAt);
  const created = Number.isNaN(parsed) ? createdAt : new Date(parsed).toISOString();
  const to = Array.isArray(raw.to) ? raw.to.filter((v): v is string => typeof v === 'string').join(', ') : typeof raw.to === 'string' ? raw.to : '';
  const subject = typeof raw.subject === 'string' ? raw.subject : '';
  return { id, createdAt: created, recipient: to || '\u2014', subject, template: classifyEmail(subject), ...normalizeStatus(typeof raw.last_event === 'string' ? raw.last_event : null) };
}

export function filterActivity(items: EmailActivityItem[], range: ActivityRange, status: ActivityStatus, now = new Date()): EmailActivityItem[] {
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = range === 'today' ? startOfToday : now.getTime() - (range === '7d' ? 7 : 30) * 86_400_000;
  return items.filter((i) => {
    const t = Date.parse(i.createdAt);
    if (Number.isNaN(t) || t < since) return false;
    if (status === 'failed') return i.status === 'failed';
    if (status === 'successful') return i.status === 'delivered' || i.status === 'sent';
    return true;
  });
}

export function parseRange(v: string | undefined): ActivityRange {
  return (ACTIVITY_RANGES as readonly string[]).includes(v ?? '') ? (v as ActivityRange) : '7d';
}
export function parseStatus(v: string | undefined): ActivityStatus {
  return (ACTIVITY_STATUSES as readonly string[]).includes(v ?? '') ? (v as ActivityStatus) : 'all';
}
