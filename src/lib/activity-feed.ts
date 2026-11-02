/**
 * Unified activity timeline: everything that happened in a business, from every source (customers added,
 * messages sent, link clicks, visits, private feedback, Google reviews, team and security events), merged
 * into one chronological, filterable stream grouped by UK calendar day.
 *
 * Pure: the page loads the raw rows and this module turns them into display events.
 */
import { UK_TIMEZONE } from '@/lib/uk-defaults';

export const ACTIVITY_KINDS = ['customer', 'message', 'click', 'visit', 'feedback', 'review', 'team'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  customer: 'Customers',
  message: 'Messages',
  click: 'Clicks',
  visit: 'Visits',
  feedback: 'Feedback',
  review: 'Reviews',
  team: 'Team & security',
};

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail?: string;
  href?: string;
  /** For colouring: good news, needs attention, or neutral. */
  sentiment?: 'positive' | 'negative' | 'neutral';
};

export type RawActivity = {
  customers: Array<{ id: string; name: string; created_at: string; source: string | null }>;
  messages: Array<{ id: string; customer_id: string; purpose: string; channel: string; status: string; sent_at: string | null; created_at: string; last_error?: string | null }>;
  clicks: Array<{ id: string; customer_id: string | null; occurred_at: string }>;
  visits: Array<{ id: string; customer_id: string; visited_at: string; price: number | null; service_id: string | null }>;
  feedback: Array<{ id: string; customer_id: string | null; rating: number | null; created_at: string; status: string }>;
  reviews: Array<{ id: string; reviewer_name: string; rating: number; review_date: string; reply_text: string | null }>;
  audit: Array<{ id: number | string; action: string; actor_email: string | null; created_at: string; target_type: string | null }>;
  customerNames: Map<string, string>;
  serviceNames: Map<string, string>;
};

const PURPOSE_LABELS: Record<string, string> = {
  review_request: 'Review request',
  review_reminder: 'Review reminder',
  rebooking_reminder: 'Rebooking reminder',
  win_back: 'Win-back message',
  birthday: 'Birthday message',
  referral: 'Referral message',
  loyalty: 'Loyalty message',
  custom: 'Message',
};

const AUDIT_LABELS: Record<string, string> = {
  'api_key.regenerated': 'API key regenerated',
  'account.exported': 'Data exported',
  'account.deleted': 'Account deleted',
  'customers.imported': 'Customers imported',
  'team.invited': 'Teammate invited',
  'team.invitation_revoked': 'Invitation revoked',
  'team.joined': 'Teammate joined',
  'team.role_changed': 'Role changed',
  'team.member_removed': 'Teammate removed',
  'webhook.configured': 'Webhook configured',
  'webhook.secret_rotated': 'Webhook secret rotated',
  'webhook.deleted': 'Webhook deleted',
  'segment.campaign_sent': 'Segment campaign sent',
  'feedback.bulk_updated': 'Feedback bulk-updated',
  'settings.retention_changed': 'Data retention changed',
  'saved_view.created': 'Saved view created',
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function buildActivity(raw: RawActivity): ActivityEvent[] {
  const name = (id: string | null | undefined) => (id ? raw.customerNames.get(id) ?? 'A customer' : 'A customer');
  const events: ActivityEvent[] = [];

  for (const c of raw.customers) {
    events.push({
      id: `customer-${c.id}`,
      kind: 'customer',
      at: c.created_at,
      title: `${c.name} added`,
      detail: c.source ? `Source: ${c.source}` : undefined,
      href: `/customers/${c.id}`,
      sentiment: 'neutral',
    });
  }
  for (const m of raw.messages) {
    const label = PURPOSE_LABELS[m.purpose] ?? 'Message';
    const failed = m.status === 'failed';
    events.push({
      id: `message-${m.id}`,
      kind: 'message',
      at: m.sent_at ?? m.created_at,
      title: failed ? `${label} to ${name(m.customer_id)} failed` : `${label} sent to ${name(m.customer_id)}`,
      detail: failed ? 'Check the email address and resend' : `By ${m.channel === 'sms' ? 'SMS' : m.channel === 'whatsapp' ? 'WhatsApp' : 'email'}`,
      href: `/customers/${m.customer_id}`,
      sentiment: failed ? 'negative' : 'neutral',
    });
  }
  for (const k of raw.clicks) {
    events.push({
      id: `click-${k.id}`,
      kind: 'click',
      at: k.occurred_at,
      title: `${name(k.customer_id)} opened your review link`,
      href: k.customer_id ? `/customers/${k.customer_id}` : undefined,
      sentiment: 'positive',
    });
  }
  for (const v of raw.visits) {
    const service = v.service_id ? raw.serviceNames.get(v.service_id) : null;
    events.push({
      id: `visit-${v.id}`,
      kind: 'visit',
      at: v.visited_at,
      title: `${name(v.customer_id)} visited${service ? ` for ${service}` : ''}`,
      detail: typeof v.price === 'number' && v.price > 0 ? gbp(v.price) : undefined,
      href: `/customers/${v.customer_id}`,
      sentiment: 'positive',
    });
  }
  for (const f of raw.feedback) {
    const low = typeof f.rating === 'number' && f.rating <= 2;
    events.push({
      id: `feedback-${f.id}`,
      kind: 'feedback',
      at: f.created_at,
      title: `${name(f.customer_id)} sent private feedback${typeof f.rating === 'number' ? ` (${f.rating}★)` : ''}`,
      detail: f.status === 'new' ? 'Awaiting reply' : f.status === 'resolved' ? 'Resolved' : 'Acknowledged',
      href: '/feedback-inbox',
      sentiment: low ? 'negative' : typeof f.rating === 'number' && f.rating >= 4 ? 'positive' : 'neutral',
    });
  }
  for (const r of raw.reviews) {
    events.push({
      id: `review-${r.id}`,
      kind: 'review',
      at: r.review_date,
      title: `New ${r.rating}★ Google review from ${r.reviewer_name || 'a customer'}`,
      detail: r.reply_text ? 'Replied' : 'Not replied yet',
      href: '/reviews?tab=reviews',
      sentiment: r.rating >= 4 ? 'positive' : r.rating <= 2 ? 'negative' : 'neutral',
    });
  }
  for (const a of raw.audit) {
    events.push({
      id: `audit-${a.id}`,
      kind: 'team',
      at: a.created_at,
      title: auditLabel(a.action),
      detail: a.actor_email ? `By ${a.actor_email}` : undefined,
      sentiment: a.action.includes('deleted') || a.action.includes('removed') ? 'negative' : 'neutral',
    });
  }

  return events
    .filter((e) => Number.isFinite(new Date(e.at).getTime()))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
}

export type ActivityDay = { key: string; label: string; events: ActivityEvent[] };

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export function ukDayKey(iso: string): string {
  return dayKeyFormat.format(new Date(iso));
}

/** Groups events (already sorted newest first) into UK calendar days labelled Today / Yesterday / date. */
export function groupByDay(events: ActivityEvent[], now: Date = new Date()): ActivityDay[] {
  const today = ukDayKey(now.toISOString());
  const yesterday = ukDayKey(new Date(now.getTime() - 86_400_000).toISOString());
  const days = new Map<string, ActivityDay>();
  for (const event of events) {
    const key = ukDayKey(event.at);
    let day = days.get(key);
    if (!day) {
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
      day = { key, label, events: [] };
      days.set(key, day);
    }
    day.events.push(event);
  }
  return [...days.values()];
}

export function countByKind(events: ActivityEvent[]): Record<ActivityKind, number> {
  const counts = Object.fromEntries(ACTIVITY_KINDS.map((k) => [k, 0])) as Record<ActivityKind, number>;
  for (const e of events) counts[e.kind] += 1;
  return counts;
}

export function parseKind(value: string | undefined | null): ActivityKind | 'all' {
  return value && (ACTIVITY_KINDS as readonly string[]).includes(value) ? (value as ActivityKind) : 'all';
}

export const ACTIVITY_WINDOWS = [7, 30, 90] as const;
export function parseWindow(value: string | undefined | null): (typeof ACTIVITY_WINDOWS)[number] {
  const n = Number(value);
  return (ACTIVITY_WINDOWS as readonly number[]).includes(n) ? (n as (typeof ACTIVITY_WINDOWS)[number]) : 30;
}
