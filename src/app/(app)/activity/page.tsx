import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAccess } from '@/lib/business';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { COUNTED_CLICK_TYPES } from '@/lib/click-analytics';
import { chunkIds } from '@/lib/fetch-all';
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  ACTIVITY_WINDOWS,
  buildActivity,
  countByKind,
  groupByDay,
  parseKind,
  parseWindow,
  type ActivityKind,
} from '@/lib/activity-feed';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedNav } from '@/components/ui/segmented-nav';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icons';
import { toneStyle, type Tone } from '@/components/ui/tones';
import { UK_TIMEZONE } from '@/lib/uk-defaults';

export const metadata: Metadata = { title: 'Activity' };

const PER_SOURCE = 200;

const KIND_STYLE: Record<ActivityKind, { icon: IconName; tone: Tone }> = {
  customer: { icon: 'userPlus', tone: 'emerald' },
  message: { icon: 'mail', tone: 'sky' },
  click: { icon: 'cursor', tone: 'violet' },
  visit: { icon: 'calendar', tone: 'teal' },
  feedback: { icon: 'chat', tone: 'rose' },
  review: { icon: 'star', tone: 'amber' },
  team: { icon: 'shield', tone: 'slate' },
};

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: UK_TIMEZONE });

export default async function ActivityPage({ searchParams }: { searchParams?: { type?: string; days?: string } }) {
  const { business, role } = await requireAccess();
  const supabase = createClient();
  const kind = parseKind(searchParams?.type);
  const days = parseWindow(searchParams?.days);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const id = business.id;
  const showAudit = can(role, 'team.manage');
  const want = (k: ActivityKind) => kind === 'all' || kind === k;
  const none = Promise.resolve({ data: [] as never[] });

  const [customers, sentMessages, failedMessages, clicks, visits, feedback, reviews, audit, services] = await Promise.all([
    want('customer') ? supabase.from('customers').select('id, name, created_at, source').eq('business_id', id).gte('created_at', since).order('created_at', { ascending: false }).limit(PER_SOURCE) : none,
    want('message') ? supabase.from('messages').select('id, customer_id, purpose, channel, status, sent_at, created_at').eq('business_id', id).eq('status', 'sent').gte('sent_at', since).order('sent_at', { ascending: false }).limit(PER_SOURCE) : none,
    want('message') ? supabase.from('messages').select('id, customer_id, purpose, channel, status, sent_at, created_at').eq('business_id', id).eq('status', 'failed').gte('created_at', since).order('created_at', { ascending: false }).limit(50) : none,
    want('click') ? supabase.from('interaction_events').select('id, customer_id, occurred_at').eq('business_id', id).in('event_type', [...COUNTED_CLICK_TYPES]).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(PER_SOURCE) : none,
    want('visit') ? supabase.from('visits').select('id, customer_id, visited_at, price, service_id').eq('business_id', id).gte('visited_at', since).order('visited_at', { ascending: false }).limit(PER_SOURCE) : none,
    want('feedback') ? supabase.from('private_feedback').select('id, customer_id, rating, created_at, status').eq('business_id', id).gte('created_at', since).order('created_at', { ascending: false }).limit(PER_SOURCE) : none,
    want('review') ? supabase.from('google_reviews').select('id, reviewer_name, rating, review_date, reply_text').eq('business_id', id).gte('review_date', since).order('review_date', { ascending: false }).limit(100) : none,
    want('team') && showAudit
      ? createAdminClient().from('audit_log').select('id, action, actor_email, created_at, target_type').eq('business_id', id).gte('created_at', since).order('created_at', { ascending: false }).limit(100)
      : none,
    supabase.from('services').select('id, name').eq('business_id', id),
  ]);

  // Names for every customer referenced, fetched in chunks (URL-length safe).
  const ids = new Set<string>();
  for (const row of [...(sentMessages.data ?? []), ...(failedMessages.data ?? []), ...(visits.data ?? [])]) ids.add(row.customer_id);
  for (const row of [...(clicks.data ?? []), ...(feedback.data ?? [])]) if (row.customer_id) ids.add(row.customer_id);
  const customerNames = new Map<string, string>((customers.data ?? []).map((c) => [c.id, c.name]));
  const missing = [...ids].filter((cid) => !customerNames.has(cid));
  const nameChunks = await Promise.all(
    chunkIds(missing, 100).map((chunk) => supabase.from('customers').select('id, name').eq('business_id', id).in('id', chunk))
  );
  for (const res of nameChunks) for (const c of res.data ?? []) customerNames.set(c.id, c.name);

  const events = buildActivity({
    customers: customers.data ?? [],
    messages: [...(sentMessages.data ?? []), ...(failedMessages.data ?? [])],
    clicks: clicks.data ?? [],
    visits: visits.data ?? [],
    feedback: feedback.data ?? [],
    reviews: reviews.data ?? [],
    audit: audit.data ?? [],
    customerNames,
    serviceNames: new Map((services.data ?? []).map((s) => [s.id, s.name])),
  });
  const counts = countByKind(events);
  const grouped = groupByDay(events);
  const kinds = ACTIVITY_KINDS.filter((k) => k !== 'team' || showAudit);

  const href = (next: { type?: string; days?: number }) => {
    const p = new URLSearchParams();
    const t = next.type ?? kind;
    const d = next.days ?? days;
    if (t !== 'all') p.set('type', t);
    if (d !== 30) p.set('days', String(d));
    const qs = p.toString();
    return `/activity${qs ? `?${qs}` : ''}`;
  };

  return (
    <div>
      <PageHeader
        title="Activity"
        icon="activity"
        tone="sky"
        description="Everything that happened in your business, from every source, in one timeline."
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <SegmentedNav
          label="Filter activity"
          active={kind}
          items={[
            { key: 'all', label: 'All', href: href({ type: 'all' }), count: kind === 'all' ? events.length : undefined },
            ...kinds.map((k) => ({ key: k, label: ACTIVITY_LABELS[k], href: href({ type: k }), count: kind === 'all' || kind === k ? counts[k] : undefined })),
          ]}
        />
        <SegmentedNav
          label="Time window"
          active={String(days)}
          items={ACTIVITY_WINDOWS.map((d) => ({ key: String(d), label: `${d} days`, href: href({ days: d }) }))}
        />
      </div>

      {grouped.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="activity"
            title="Nothing in this window"
            description="Try a longer time window or a different filter. New activity appears here as it happens."
            action={<Link href="/activity?days=90" className="btn btn-secondary btn-sm">Show 90 days</Link>}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((day) => (
            <section key={day.key} aria-labelledby={`day-${day.key}`}>
              <h2 id={`day-${day.key}`} className="sticky top-16 z-10 -mx-1 mb-3 flex items-center gap-2 bg-app/80 px-1 py-1.5 text-[13px] font-semibold text-ink-2 backdrop-blur">
                {day.label}
                <span className="rounded-full bg-surface-muted px-2 py-px text-2xs font-semibold tabular-nums text-ink-3">{day.events.length}</span>
              </h2>
              <ol className="card divide-y divide-line/70 overflow-hidden">
                {day.events.map((event) => {
                  const style = KIND_STYLE[event.kind];
                  const body = (
                    <>
                      <span style={toneStyle(style.tone)} className="tone-soft flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
                        <Icon name={style.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{event.title}</span>
                        {event.detail && (
                          <span className={`block truncate text-xs ${event.sentiment === 'negative' ? 'text-rose-600 dark:text-rose-400' : 'text-ink-3'}`}>{event.detail}</span>
                        )}
                      </span>
                      <time dateTime={event.at} className="flex-shrink-0 text-xs tabular-nums text-ink-4">
                        {timeFormat.format(new Date(event.at))}
                      </time>
                    </>
                  );
                  return (
                    <li key={event.id}>
                      {event.href ? (
                        <Link href={event.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-500/[0.05] sm:px-5">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {events.length >= PER_SOURCE && (
            <p className="text-center text-xs text-ink-4">Showing the most recent {PER_SOURCE} items per source. Narrow the filter to see more.</p>
          )}
        </div>
      )}
    </div>
  );
}
