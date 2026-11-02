'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, StarFilled } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/submit-button';
import { CopyButton } from '@/components/ui/copy-button';
import { useToast } from '@/components/toast';
import { mailtoLink } from '@/lib/intelligence/feedback-triage';
import { bulkUpdateFeedbackStatus, updateFeedbackStatus, type FeedbackStatus } from './actions';

export type FeedbackItem = {
  id: string;
  rating: number | null;
  comment: string;
  status: FeedbackStatus;
  createdLabel: string;
  waitingLabel: string;
  customer: { name: string; email: string } | null;
  customerId: string | null;
  triage: {
    urgency: 'critical' | 'high' | 'normal' | 'low';
    sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
    topics: Array<{ key: string; label: string }>;
    reasons: string[];
    overdue: boolean;
  };
  draft: { subject: string; body: string };
};

const statusTones: Record<FeedbackStatus, BadgeTone> = { new: 'warning', acknowledged: 'info', resolved: 'success' };

const URGENCY: Record<FeedbackItem['triage']['urgency'], { label: string; className: string; edge: string }> = {
  critical: { label: 'Critical', className: 'bg-rose-500 text-white', edge: 'border-l-rose-500' },
  high: { label: 'High', className: 'bg-amber-500/15 text-amber-800 ring-1 ring-inset ring-amber-600/25 dark:text-amber-300', edge: 'border-l-amber-500' },
  normal: { label: 'Normal', className: 'bg-surface-muted text-ink-2 ring-1 ring-inset ring-line-strong/70', edge: 'border-l-sky-400' },
  low: { label: 'Low', className: 'bg-surface-muted text-ink-3 ring-1 ring-inset ring-line-strong/60', edge: 'border-l-brand-400' },
};

const SENTIMENT: Record<FeedbackItem['triage']['sentiment'], { label: string; tone: BadgeTone }> = {
  positive: { label: 'Positive', tone: 'success' },
  neutral: { label: 'Neutral', tone: 'neutral' },
  negative: { label: 'Negative', tone: 'danger' },
  mixed: { label: 'Mixed', tone: 'warning' },
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-px" role="img" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <StarFilled key={value} className={`h-4 w-4 ${value <= rating ? 'text-amber-400' : 'text-line-strong'}`} />
      ))}
    </span>
  );
}

function FeedbackCard({
  item,
  status,
  selected,
  onSelect,
  onStatus,
  busy,
}: {
  item: FeedbackItem;
  status: FeedbackStatus;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onStatus: (status: FeedbackStatus) => void;
  busy: FeedbackStatus | null;
}) {
  const [showDraft, setShowDraft] = useState(false);
  const [draft, setDraft] = useState(item.draft.body);
  const urgency = URGENCY[item.triage.urgency];
  const sentiment = SENTIMENT[item.triage.sentiment];
  const email = item.customer?.email ?? null;

  return (
    <li className={`card animate-fade-in border-l-[3px] p-5 sm:p-6 ${status === 'resolved' ? 'border-l-line opacity-80' : urgency.edge}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select feedback from ${item.customer?.name ?? 'unknown customer'}`}
            className="h-4 w-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
          />
          <Avatar name={item.customer?.name ?? '?'} size="lg" />
          <div className="min-w-0">
            {item.customerId ? (
              <Link href={`/customers/${item.customerId}`} className="block truncate text-sm font-semibold text-ink hover:underline">
                {item.customer?.name ?? 'Unknown customer'}
              </Link>
            ) : (
              <p className="truncate text-sm font-semibold text-ink">{item.customer?.name ?? 'Unknown customer'}</p>
            )}
            {email && <p className="truncate text-[13px] text-ink-3">{email}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {item.rating ? <Stars rating={item.rating} /> : null}
          <Badge tone={statusTones[status]} dot className="capitalize">
            {status}
          </Badge>
          <span className="text-xs text-ink-3" title={item.createdLabel}>
            {status === 'resolved' ? item.createdLabel : (
              <span className={item.triage.overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>Waiting {item.waitingLabel}</span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {status !== 'resolved' && (
          <span className={`rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${urgency.className}`} title={item.triage.reasons.join(' · ') || undefined}>
            {urgency.label}
          </span>
        )}
        <Badge tone={sentiment.tone}>{sentiment.label}</Badge>
        {item.triage.topics.map((t) => (
          <span key={t.key} className="rounded-full bg-surface-muted px-2 py-0.5 text-2xs font-medium text-ink-2 ring-1 ring-inset ring-line">
            {t.label}
          </span>
        ))}
      </div>
      {status !== 'resolved' && item.triage.reasons.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-ink-3">
          <Icon name="sparkles" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-600 dark:text-brand-400" />
          {item.triage.reasons.join(' · ')}
        </p>
      )}

      <p className="mt-4 whitespace-pre-line rounded-lg bg-surface-subtle px-4 py-3 text-sm leading-6 text-ink-2 ring-1 ring-inset ring-line">{item.comment}</p>

      {showDraft && (
        <div className="mt-4 rounded-xl border border-brand-500/25 bg-brand-500/[0.04] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800 dark:text-brand-300">
              <Icon name="sparkles" className="h-3.5 w-3.5" />
              Suggested reply. Edit it, then send from your own email.
            </p>
            <CopyButton value={draft} />
          </div>
          <label htmlFor={`draft-${item.id}`} className="sr-only">Reply draft</label>
          <textarea
            id={`draft-${item.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(14, draft.split('\n').length + 1)}
            className="input font-sans text-[13px] leading-6"
          />
          <p className="mt-2 text-2xs leading-4 text-ink-4">Drafted inside Pentriq from the message&apos;s topics. It never promises refunds or discounts: add any offer yourself.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {email ? (
          <a
            href={mailtoLink(email, { subject: item.draft.subject, body: draft })}
            onClick={() => {
              if (status === 'new') onStatus('acknowledged');
            }}
            className="btn btn-primary btn-sm"
          >
            <Icon name="reply" className="h-3.5 w-3.5" />
            Reply by email
          </a>
        ) : null}
        <button type="button" onClick={() => setShowDraft((v) => !v)} className="btn btn-secondary btn-sm" aria-expanded={showDraft}>
          <Icon name="sparkles" className="h-3.5 w-3.5" />
          {showDraft ? 'Hide reply' : 'Suggested reply'}
        </button>
        {status === 'new' && (
          <button type="button" disabled={busy !== null} onClick={() => onStatus('acknowledged')} className="btn btn-secondary btn-sm">
            {busy === 'acknowledged' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="eye" className="h-3.5 w-3.5" />}
            Acknowledge
          </button>
        )}
        {status !== 'resolved' ? (
          <button type="button" disabled={busy !== null} onClick={() => onStatus('resolved')} className="btn btn-secondary btn-sm">
            {busy === 'resolved' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2} />}
            Resolve
          </button>
        ) : (
          <button type="button" disabled={busy !== null} onClick={() => onStatus('new')} className="btn btn-ghost btn-sm">
            {busy === 'new' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-3.5 w-3.5" />}
            Reopen
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Triage workspace. Status changes apply instantly on screen (optimistic) and roll back with a toast if the
 * server rejects them. Search filters the current view as you type; selection enables bulk actions.
 */
export function FeedbackList({ items, hasAny, view }: { items: FeedbackItem[]; hasAny: boolean; view: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [overrides, setOverrides] = useState<Record<string, FeedbackStatus>>({});
  const [busy, setBusy] = useState<Record<string, FeedbackStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return items;
    return items.filter((item) => {
      const hay = `${item.comment} ${item.customer?.name ?? ''} ${item.customer?.email ?? ''} ${item.triage.topics.map((t) => t.label).join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [items, query]);

  function setStatus(item: FeedbackItem, status: FeedbackStatus) {
    const previous = overrides[item.id] ?? item.status;
    setOverrides((o) => ({ ...o, [item.id]: status }));
    setBusy((b) => ({ ...b, [item.id]: status }));
    startTransition(async () => {
      try {
        await updateFeedbackStatus(item.id, status);
        router.refresh();
      } catch {
        setOverrides((o) => ({ ...o, [item.id]: previous }));
        push({ variant: 'error', title: 'Could not update that message', description: 'Please try again.' });
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[item.id];
          return next;
        });
      }
    });
  }

  function bulk(status: FeedbackStatus) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const before = { ...overrides };
    setOverrides((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, status])) }));
    startTransition(async () => {
      const result = await bulkUpdateFeedbackStatus(ids, status).catch(() => ({ ok: false, updated: 0, message: 'Something went wrong.' }));
      setBulkBusy(false);
      if (!result.ok) {
        setOverrides(before);
        push({ variant: 'error', title: result.message });
        return;
      }
      setSelected(new Set());
      push({ variant: 'success', title: result.message });
      router.refresh();
    });
  }

  if (!hasAny) {
    return (
      <div className="card">
        <EmptyState
          icon="inbox"
          title="No feedback yet"
          description="Private feedback submitted by customers from a review request shows up here, triaged by urgency with a reply ready."
        />
      </div>
    );
  }

  const allSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search feedback</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages, names or topics…"
            className="input pl-9"
          />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-3">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((i) => i.id)) : new Set())}
            className="h-4 w-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
          />
          Select all
        </label>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-20 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur" role="toolbar" aria-label="Bulk actions">
          <span className="mr-2 text-[13px] font-semibold text-ink">{selected.size} selected</span>
          <button type="button" disabled={bulkBusy} onClick={() => bulk('acknowledged')} className="btn btn-secondary btn-sm">
            <Icon name="eye" className="h-3.5 w-3.5" /> Acknowledge
          </button>
          <button type="button" disabled={bulkBusy} onClick={() => bulk('resolved')} className="btn btn-primary btn-sm">
            {bulkBusy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2} />} Resolve
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="btn btn-ghost btn-sm ml-auto">
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="inbox"
            title={query ? `No matches for “${query.trim()}”` : view === 'critical' ? 'Nothing critical' : view === 'overdue' ? 'Nothing overdue' : 'All caught up'}
            description={query ? 'Try a different word.' : "You're all caught up for this view."}
            className="py-12"
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              status={overrides[item.id] ?? item.status}
              selected={selected.has(item.id)}
              onSelect={(checked) =>
                setSelected((s) => {
                  const next = new Set(s);
                  if (checked) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                })
              }
              onStatus={(status) => setStatus(item, status)}
              busy={busy[item.id] ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
