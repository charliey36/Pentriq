import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { fetchAll, chunkIds } from '@/lib/fetch-all';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedNav } from '@/components/ui/segmented-nav';
import { FeedbackList, type FeedbackItem } from './feedback-list';
import { formatUKDateTime } from '@/lib/uk-defaults';
import { TOPICS, TOPIC_LABELS, type Topic } from '@/lib/intelligence/lexicon';
import {
  RESPONSE_TARGET_HOURS,
  compareForInbox,
  draftFeedbackReply,
  inboxStats,
  summariseTopics,
  triageFeedback,
} from '@/lib/intelligence/feedback-triage';

export const metadata: Metadata = { title: 'Feedback inbox' };

const VIEWS = ['open', 'critical', 'overdue', 'resolved', 'all'] as const;
type View = (typeof VIEWS)[number];

function hoursLabel(hours: number): string {
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default async function FeedbackInboxPage({ searchParams }: { searchParams?: { view?: string; topic?: string } }) {
  const business = await requireBusiness();
  const supabase = createClient();
  const view: View = (VIEWS as readonly string[]).includes(searchParams?.view ?? '') ? (searchParams?.view as View) : 'open';
  const topic: Topic | null = (TOPICS as readonly string[]).includes(searchParams?.topic ?? '') ? (searchParams?.topic as Topic) : null;
  const now = new Date();

  // Paged past the 1000-row response cap: an inbox must never silently drop messages.
  const feedback = await fetchAll((from, to) =>
    supabase
      .from('private_feedback')
      .select('id, rating, comment, status, created_at, customer_id')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  ).catch(() => []);

  const customerIds = [...new Set(feedback.map((f) => f.customer_id).filter(Boolean))] as string[];
  const customerRows = (
    await Promise.all(chunkIds(customerIds, 100).map((chunk) => supabase.from('customers').select('id, name, email').eq('business_id', business.id).in('id', chunk)))
  ).flatMap((r) => r.data ?? []);
  const customerById = new Map(customerRows.map((c) => [c.id, c]));

  const triaged = feedback.map((row) => {
    const status = row.status as FeedbackItem['status'];
    const triage = triageFeedback({ rating: row.rating, comment: row.comment, createdAt: row.created_at, status }, now);
    return { row, status, triage, createdAt: row.created_at };
  });
  triaged.sort(compareForInbox);

  const stats = inboxStats(triaged.map((t) => ({ ...t.triage, status: t.status })));
  const topics = summariseTopics(triaged.filter((t) => t.status !== 'resolved').map((t) => t.triage));

  const inView = (t: (typeof triaged)[number]) => {
    switch (view) {
      case 'open':
        return t.status !== 'resolved';
      case 'critical':
        return t.status !== 'resolved' && t.triage.urgency === 'critical';
      case 'overdue':
        return t.triage.overdue;
      case 'resolved':
        return t.status === 'resolved';
      default:
        return true;
    }
  };
  const visible = triaged.filter((t) => inView(t) && (!topic || t.triage.topics.includes(topic)));

  const items: FeedbackItem[] = visible.map(({ row, status, triage }) => {
    const customer = row.customer_id ? customerById.get(row.customer_id) ?? null : null;
    const draft = draftFeedbackReply({ businessName: business.name ?? '', customerName: customer?.name, triage });
    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      status,
      createdLabel: formatUKDateTime(new Date(row.created_at)),
      waitingLabel: hoursLabel(triage.ageHours),
      customer,
      customerId: row.customer_id,
      triage: {
        urgency: triage.urgency,
        sentiment: triage.sentiment,
        topics: triage.topics.map((t) => ({ key: t, label: TOPIC_LABELS[t] })),
        reasons: triage.reasons,
        overdue: triage.overdue,
      },
      draft,
    };
  });

  const counts: Record<View, number> = {
    open: triaged.filter((t) => t.status !== 'resolved').length,
    critical: stats.critical,
    overdue: stats.overdue,
    resolved: triaged.filter((t) => t.status === 'resolved').length,
    all: triaged.length,
  };
  const viewHref = (v: View, tp: Topic | null = topic) => {
    const p = new URLSearchParams();
    if (v !== 'open') p.set('view', v);
    if (tp) p.set('topic', tp);
    const qs = p.toString();
    return `/feedback-inbox${qs ? `?${qs}` : ''}`;
  };

  const statTiles = [
    { label: 'Open', value: String(stats.open), hint: 'New or acknowledged' },
    { label: 'Overdue', value: String(stats.overdue), hint: `Waiting over ${RESPONSE_TARGET_HOURS}h`, warn: stats.overdue > 0 },
    { label: 'Critical', value: String(stats.critical), hint: 'Safety, legal or money', warn: stats.critical > 0 },
    { label: 'Median wait', value: stats.medianOpenAgeHours === null ? '—' : hoursLabel(stats.medianOpenAgeHours), hint: 'For open messages' },
    { label: 'Negative', value: stats.negativeShare === null ? '—' : `${stats.negativeShare}%`, hint: 'Of all feedback' },
  ];

  return (
    <div>
      <PageHeader
        title="Feedback inbox"
        icon="chat"
        tone="rose"
        description="Private feedback, triaged for you: the most urgent first, what each message is about, and a reply ready to send."
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {statTiles.map((tile) => (
          <div key={tile.label} className={`card px-4 py-3 ${tile.warn ? 'ring-1 ring-inset ring-rose-500/30' : ''}`}>
            <dt className="text-xs font-medium text-ink-3">{tile.label}</dt>
            <dd className={`mt-1 text-2xl font-semibold tracking-[-0.03em] tabular-nums ${tile.warn ? 'text-rose-600 dark:text-rose-400' : 'text-ink'}`}>{tile.value}</dd>
            <dd className="text-2xs text-ink-4">{tile.hint}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-4 flex flex-col gap-3">
        <SegmentedNav
          label="Inbox views"
          active={view}
          items={[
            { key: 'open', label: 'Open', href: viewHref('open'), count: counts.open },
            { key: 'critical', label: 'Critical', href: viewHref('critical'), count: counts.critical, tone: counts.critical > 0 ? 'danger' : 'default' },
            { key: 'overdue', label: 'Overdue', href: viewHref('overdue'), count: counts.overdue, tone: counts.overdue > 0 ? 'warning' : 'default' },
            { key: 'resolved', label: 'Resolved', href: viewHref('resolved'), count: counts.resolved },
            { key: 'all', label: 'All', href: viewHref('all'), count: counts.all },
          ]}
        />
        {topics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by topic">
            <span className="mr-1 text-xs font-medium text-ink-4">Topics</span>
            {topic && (
              <a href={viewHref(view, null)} className="rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-surface">
                {TOPIC_LABELS[topic]} ×
              </a>
            )}
            {topics
              .filter((t) => t.topic !== topic)
              .slice(0, 8)
              .map((t) => (
                <a
                  key={t.topic}
                  href={viewHref(view, t.topic)}
                  className="rounded-full border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:border-brand-500/40 hover:text-ink"
                >
                  {t.label} <span className="tabular-nums text-ink-4">{t.count}</span>
                  {t.negative > 0 && <span className="ml-1 text-rose-600 dark:text-rose-400">·{t.negative}</span>}
                </a>
              ))}
          </div>
        )}
      </div>

      <FeedbackList items={items} hasAny={triaged.length > 0} view={view} />
    </div>
  );
}
