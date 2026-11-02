'use client';

import { useMemo, useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { StarFilled } from '@/components/ui/icons';
import { formatUKDate } from '@/lib/uk-defaults';
import { MAX_REPLY_LENGTH } from '@/lib/google-business-constants';
import { draftReviewReplyAction, replyToGoogleReview } from './actions';

export type ReviewItem = {
  id: string;
  reviewer_name: string;
  reviewer_photo_url: string | null;
  rating: number;
  comment: string | null;
  review_date: string;
  reply_text: string | null;
  reply_update_time: string | null;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarFilled key={n} className={`h-4 w-4 ${n <= rating ? 'text-amber-400' : 'text-line-strong'}`} />
      ))}
    </span>
  );
}

function ReviewRow({ review, canReply, aiEnabled }: { review: ReviewItem; canReply: boolean; aiEnabled: boolean }) {
  const [reply, setReply] = useState(review.reply_text);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.reply_text ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [drafting, startDraft] = useTransition();
  const [aiNote, setAiNote] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await replyToGoogleReview(review.id, draft);
      if (res.ok) {
        setReply(res.replyText ?? draft.trim());
        setEditing(false);
      } else {
        setError(res.message);
      }
    });
  }

  function aiDraft() {
    setError(null);
    startDraft(async () => {
      const res = await draftReviewReplyAction(review.id);
      if (res.ok && res.text) {
        setDraft(res.text);
        setAiNote(true);
      } else {
        setError(res.message ?? 'Could not draft a reply.');
      }
    });
  }

  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Avatar name={review.reviewer_name} src={review.reviewer_photo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="truncate text-sm font-semibold text-ink">{review.reviewer_name}</p>
            <Stars rating={review.rating} />
            <time dateTime={review.review_date} className="text-xs text-ink-3">
              {formatUKDate(new Date(review.review_date))}
            </time>
          </div>

          {review.comment ? (
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-ink-2">{review.comment}</p>
          ) : (
            <p className="mt-2 text-sm italic text-ink-4">No written comment.</p>
          )}

          {reply && !editing && (
            <div className="mt-3 rounded-xl bg-surface-muted/70 p-3 text-sm ring-1 ring-inset ring-line">
              <p className="text-xs font-semibold text-ink-3">Your reply</p>
              <p className="mt-1 whitespace-pre-line break-words text-ink-2">{reply}</p>
            </div>
          )}

          {canReply && !editing && (
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-2 -ml-2"
              onClick={() => {
                setDraft(reply ?? '');
                setEditing(true);
              }}
            >
              {reply ? 'Edit reply' : 'Reply'}
            </button>
          )}

          {editing && (
            <form onSubmit={submit} className="mt-3 space-y-2">
              <label htmlFor={`reply-${review.id}`} className="sr-only">
                Reply to {review.reviewer_name}
              </label>
              <textarea
                id={`reply-${review.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_REPLY_LENGTH}
                rows={4}
                required
                disabled={pending}
                placeholder="Write a public reply. It will be posted on Google."
                className="input w-full"
              />
              {error && <Notice variant="error">{error}</Notice>}
              {aiNote && <p className="text-xs text-ink-3">AI-drafted. Read it and edit anything before you post; nothing is posted until you press the button.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !draft.trim()}>
                  {pending ? (
                    <>
                      <Spinner className="h-3.5 w-3.5" /> Posting&hellip;
                    </>
                  ) : (
                    'Post reply to Google'
                  )}
                </button>
                {aiEnabled && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={pending || drafting} onClick={aiDraft}>
                    {drafting ? (
                      <>
                        <Spinner className="h-3.5 w-3.5" /> Drafting&hellip;
                      </>
                    ) : (
                      'Draft with AI'
                    )}
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <span className="ml-auto text-xs text-ink-4 tabular-nums">
                  {draft.length}/{MAX_REPLY_LENGTH}
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}

export type ReviewFilter = 'all' | 'unreplied' | 'negative' | 'positive';
const FILTERS: Array<{ key: ReviewFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unreplied', label: 'Needs a reply' },
  { key: 'negative', label: '1–3★' },
  { key: 'positive', label: '4–5★' },
];
const STEP = 25;

/**
 * Reviews with triage controls: filter to the ones that need a reply (or by rating), search the text, and
 * load more progressively instead of rendering hundreds of rows at once.
 */
export function ReviewList({
  reviews,
  canReply,
  aiEnabled = false,
  initialFilter = 'all',
}: {
  reviews: ReviewItem[];
  canReply: boolean;
  aiEnabled?: boolean;
  initialFilter?: ReviewFilter;
}) {
  const [filter, setFilter] = useState<ReviewFilter>(initialFilter);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(STEP);

  const counts = useMemo(
    () => ({
      all: reviews.length,
      unreplied: reviews.filter((r) => !r.reply_text).length,
      negative: reviews.filter((r) => r.rating <= 3).length,
      positive: reviews.filter((r) => r.rating >= 4).length,
    }),
    [reviews]
  );

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return reviews.filter((r) => {
      if (filter === 'unreplied' && r.reply_text) return false;
      if (filter === 'negative' && r.rating > 3) return false;
      if (filter === 'positive' && r.rating < 4) return false;
      if (terms.length === 0) return true;
      const hay = `${r.reviewer_name} ${r.comment ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [reviews, filter, query]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter reviews" className="inline-flex gap-1 rounded-xl border border-line bg-surface-subtle/80 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setLimit(STEP);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                filter === f.key ? 'bg-surface text-ink shadow-xs ring-1 ring-inset ring-line-strong' : 'text-ink-3 hover:bg-surface hover:text-ink'
              }`}
            >
              {f.label}
              <span className={`rounded-full px-1.5 text-2xs font-semibold tabular-nums ${f.key === 'unreplied' && counts.unreplied > 0 ? 'bg-amber-500 text-white' : 'bg-surface-muted text-ink-3'}`}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search reviews</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reviews…" className="input py-2" />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">{filter === 'unreplied' && !query ? 'Every review has a reply. Nice work.' : 'No reviews match.'}</p>
      ) : (
        <ul className="divide-y divide-line/70">
          {visible.slice(0, limit).map((r) => (
            <ReviewRow key={r.id} review={r} canReply={canReply} aiEnabled={aiEnabled} />
          ))}
        </ul>
      )}
      {visible.length > limit && (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={() => setLimit((n) => n + STEP)} className="btn btn-secondary btn-sm">
            Show {Math.min(STEP, visible.length - limit)} more of {visible.length - limit}
          </button>
        </div>
      )}
    </div>
  );
}
