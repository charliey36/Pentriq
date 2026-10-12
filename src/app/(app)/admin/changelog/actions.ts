'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser, isAdminEmail } from '@/lib/business';

const TAGS = ['New', 'Improved', 'Infrastructure'] as const;

/** Every action re-checks admin status; hiding the page is not enough, actions are public endpoints. */
async function requireAdmin() {
  const user = await getAuthUser();
  if (!user || !isAdminEmail(user.email)) redirect('/dashboard');
}

function parse(fd: FormData) {
  const title = String(fd.get('title') ?? '').trim().slice(0, 140);
  const description = String(fd.get('description') ?? '').trim().slice(0, 1000);
  const tag = TAGS.find((t) => t === fd.get('tag')) ?? 'New';
  const date = String(fd.get('entry_date') ?? '');
  const entry_date = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return { title, description, tag, entry_date };
}

const refresh = () => {
  revalidatePath('/admin/changelog');
  revalidatePath('/changelog');
};

/** Saves a new entry as UNPUBLISHED; the Monday digest (or "Publish now") makes it public. */
export async function createEntry(fd: FormData) {
  await requireAdmin();
  const v = parse(fd);
  if (!v.title) return;
  await createAdminClient().from('changelog_entries').insert({ ...v, published: false });
  refresh();
}

export async function updateEntry(id: string, fd: FormData) {
  await requireAdmin();
  const v = parse(fd);
  if (!v.title) return;
  await createAdminClient().from('changelog_entries').update(v).eq('id', id);
  refresh();
}

export async function deleteEntry(id: string) {
  await requireAdmin();
  await createAdminClient().from('changelog_entries').delete().eq('id', id);
  refresh();
}

/** Publishes one entry immediately, without waiting for the Monday digest. */
export async function publishEntry(id: string) {
  await requireAdmin();
  await createAdminClient().from('changelog_entries').update({ published: true, published_at: new Date().toISOString() }).eq('id', id);
  refresh();
}
