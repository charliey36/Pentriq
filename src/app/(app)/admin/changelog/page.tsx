import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuthUser, isAdminEmail, requireBusiness } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Badge } from '@/components/ui/badge';
import { createEntry, deleteEntry, publishEntry, updateEntry } from './actions';

export const metadata: Metadata = { title: 'Changelog admin' };

const TAGS = ['New', 'Improved', 'Infrastructure'];

function Fields({ e }: { e?: { title: string; description: string; tag: string; entry_date: string } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <input name="title" required maxLength={140} defaultValue={e?.title} placeholder="Short title, e.g. Stripe billing integration" className="input" aria-label="Title" />
      <select name="tag" defaultValue={e?.tag ?? 'New'} className="input" aria-label="Tag">
        {TAGS.map((t) => <option key={t}>{t}</option>)}
      </select>
      <input name="entry_date" type="date" defaultValue={e?.entry_date ?? new Date().toISOString().slice(0, 10)} className="input" aria-label="Date" />
      <textarea name="description" maxLength={1000} rows={2} defaultValue={e?.description} placeholder="Optional detail shown under the title" className="input sm:col-span-3" aria-label="Description" />
    </div>
  );
}

export default async function AdminChangelogPage() {
  await requireBusiness();
  const user = await getAuthUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const { data: entries } = await createAdminClient().from('changelog_entries').select('*').order('published').order('entry_date', { ascending: false }).limit(200);

  return (
    <div>
      <PageHeader
        title="Changelog"
        icon="sparkles"
        tone="slate"
        description="New entries stay unpublished until the Monday 09:00 digest runs, or until you press Publish now. Titles feed the weekly paragraph, so keep them short noun phrases."
      />
      <div className="space-y-6">
        <SectionCard title="New entry">
          <form action={createEntry} className="space-y-3">
            <Fields />
            <button type="submit" className="btn btn-primary">Save as unpublished</button>
          </form>
        </SectionCard>

        <SectionCard title={`Entries (${entries?.length ?? 0})`} flush>
          <ul className="divide-y divide-line">
            {(entries ?? []).map((e) => (
              <li key={e.id} className="px-5 py-4 sm:px-6">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{e.title}</span>
                    <Badge tone={e.published ? 'success' : 'warning'}>{e.published ? 'Published' : 'Unpublished'}</Badge>
                    <span className="text-xs text-ink-4">{e.tag} · {e.entry_date}</span>
                  </summary>
                  <form action={updateEntry.bind(null, e.id)} className="mt-3 space-y-3">
                    <Fields e={e} />
                    <button type="submit" className="btn btn-secondary btn-sm">Save changes</button>
                  </form>
                  <div className="mt-2 flex gap-2">
                    {!e.published && (
                      <form action={publishEntry.bind(null, e.id)}><button type="submit" className="btn btn-primary btn-sm">Publish now</button></form>
                    )}
                    <form action={deleteEntry.bind(null, e.id)}><button type="submit" className="btn btn-danger-ghost btn-sm">Delete</button></form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
