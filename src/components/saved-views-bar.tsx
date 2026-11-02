'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/toast';
import { Icon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/submit-button';
import { viewHref, type SavedViewScope } from '@/lib/saved-views';
import { createSavedView, deleteSavedView } from '@/app/(app)/saved-views-actions';

export type ViewChip = { id: string; name: string; query: string; canDelete: boolean };

/**
 * Team-shared saved filters for a list screen. "Save view" captures whatever the URL currently holds (the
 * list keeps its filters in the URL), so saving needs no knowledge of the list's internals.
 */
export function SavedViewsBar({ scope, views, quick = [] }: { scope: SavedViewScope; views: ViewChip[]; quick?: Array<{ name: string; query: string }> }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  function save() {
    const query = window.location.search;
    startTransition(async () => {
      const result = await createSavedView(scope, name, query);
      push({ variant: result.ok ? 'success' : 'error', title: result.message });
      if (result.ok) {
        setNaming(false);
        setName('');
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteSavedView(id);
      push({ variant: result.ok ? 'success' : 'error', title: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Saved views">
      <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-ink-4">
        <Icon name="bookmark" className="h-3.5 w-3.5" />
        Views
      </span>
      {quick.map((q) => (
        <Link key={q.name} href={viewHref(scope, q.query)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-3 hover:border-brand-500/40 hover:text-ink">
          {q.name}
        </Link>
      ))}
      {views.map((v) => (
        <span key={v.id} className="group inline-flex items-center rounded-full border border-brand-500/25 bg-brand-500/[0.06] text-xs font-medium text-brand-800 dark:text-brand-300">
          <Link href={viewHref(scope, v.query)} className="py-1 pl-2.5 pr-2 hover:underline">
            {v.name}
          </Link>
          {v.canDelete && (
            <button type="button" disabled={pending} onClick={() => remove(v.id)} aria-label={`Delete view ${v.name}`} className="mr-1 rounded-full p-0.5 opacity-60 hover:bg-brand-500/15 hover:opacity-100">
              <Icon name="x" className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {naming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="inline-flex items-center gap-1"
        >
          <label htmlFor={`view-name-${scope}`} className="sr-only">View name</label>
          <input
            id={`view-name-${scope}`}
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
            placeholder="Name this view"
            className="input h-7 w-44 rounded-full px-3 py-0 text-xs"
          />
          <button type="submit" disabled={pending || !name.trim()} className="btn btn-primary btn-sm h-7 rounded-full px-3 py-0 text-xs">
            {pending ? <Spinner className="h-3 w-3" /> : 'Save'}
          </button>
          <button type="button" onClick={() => setNaming(false)} className="btn btn-ghost btn-sm h-7 rounded-full px-2 py-0 text-xs">
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-ink-3 hover:border-brand-500/50 hover:text-ink">
          <Icon name="plus" className="h-3 w-3" />
          Save current view
        </button>
      )}
    </div>
  );
}
