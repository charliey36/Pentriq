'use client';

import { useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { StarFilled } from '@/components/ui/icons';
import { formatUKDate } from '@/lib/uk-defaults';
import { MAX_REPLY_LENGTH } from '@/lib/google-business-constants';
import { replyToGoogleReview } from './actions';

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

function ReviewRow({ review, canReply }: { review: ReviewItem; canReply: boolean }) {
  const [reply, setReply] = useState(review.reply_text);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.reply_text ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

export function ReviewList({ reviews, canReply }: { reviews: ReviewItem[]; canReply: boolean }) {
  return (
    <ul className="divide-y divide-line/70">
      {reviews.map((r) => (
        <ReviewRow key={r.id} review={r} canReply={canReply} />
      ))}
    </ul>
  );
}
