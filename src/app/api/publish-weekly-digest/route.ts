import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildDigest, weekStart, type ChangelogTag } from '@/lib/changelog';

export const dynamic = 'force-dynamic';

/**
 * Mondays 09:00 (UTC, see vercel.json): turns ALL unpublished changelog entries
 * into one "What's New This Week" paragraph (plain template, no AI), saves it,
 * and marks those entries published. Safe to run twice: a second run in the same
 * week finds the digest already saved and does nothing.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set.' }, { status: 500 });
  if (!isCronAuthorized(request, secret)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const db = createAdminClient();
  const { data: pending, error } = await db.from('changelog_entries').select('id, title, tag').eq('published', false).order('entry_date');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ published: 0, message: 'Nothing to publish.' });

  const weekOf = weekStart(new Date().toISOString().slice(0, 10));
  const summary = buildDigest(pending.map((e) => ({ title: e.title, tag: e.tag as ChangelogTag })));

  const { error: digestError } = await db.from('changelog_digests').insert({ week_of: weekOf, summary });
  if (digestError) {
    if (digestError.code === '23505') return NextResponse.json({ published: 0, message: 'This week’s digest already exists.' });
    return NextResponse.json({ error: digestError.message }, { status: 500 });
  }

  const { error: publishError } = await db
    .from('changelog_entries')
    .update({ published: true, published_at: new Date().toISOString(), digest_week: weekOf })
    .in('id', pending.map((e) => e.id));
  if (publishError) {
    await db.from('changelog_digests').delete().eq('week_of', weekOf); // allow a clean retry
    return NextResponse.json({ error: publishError.message }, { status: 500 });
  }

  return NextResponse.json({ published: pending.length, weekOf, summary });
}
