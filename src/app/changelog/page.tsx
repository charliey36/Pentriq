import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { ResourceLinks } from '@/components/marketing/resource-links';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { createAdminClient } from '@/lib/supabase/admin';
import { groupChangelog, type ChangelogEntry } from '@/lib/changelog';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

export const metadata = pageMetadata({
  title: 'Changelog',
  description: 'What is new in Pentriq: product updates, billing, analytics and infrastructure changes, newest first.',
  path: '/changelog',
});

// Refresh at most once a minute; the page is public and cheap to rebuild.
export const revalidate = 60;

const tone: Record<string, BadgeTone> = { New: 'success', Improved: 'info', Infrastructure: 'neutral' };
const id = (s: string) => s.replace(/\s/g, '-');

export default async function ChangelogPage() {
  const db = createAdminClient();
  const [{ data: entries }, { data: digest }] = await Promise.all([
    db.from('changelog_entries').select('id, title, description, tag, entry_date').eq('published', true).order('entry_date', { ascending: false }).limit(500),
    db.from('changelog_digests').select('week_of, summary').order('week_of', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const months = groupChangelog((entries ?? []) as ChangelogEntry[]);

  return (
    <PageFrame eyebrow="Changelog" title="What’s new in Pentriq" intro="A running record of what we have shipped, newest first.">
      <JsonLd data={breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'Changelog', url: `${SITE_URL}/changelog` }])} />
      <ResourceLinks current="/changelog" />
      {digest && (
        <aside className="card mb-10 p-5">
          <p className="eyebrow text-brand-700 dark:text-brand-400">What’s new this week</p>
          <p className="mt-2 text-[15px] leading-7 text-ink-2">{digest.summary}</p>
        </aside>
      )}
      {months.length === 0 && <p className="text-ink-3">Nothing here yet. Check back soon.</p>}
      <div className="space-y-12">
        {months.map((m) => (
          <section key={m.month} aria-labelledby={id(m.month)}>
            <h2 id={id(m.month)} className="text-2xl font-semibold tracking-[-0.02em] text-ink">{m.month}</h2>
            {m.weeks.map((w) => (
              <div key={w.weekOf} className="mt-6">
                <h3 className="text-sm font-semibold text-ink-2">{w.label}</h3>
                <ul className="mt-3 space-y-3 border-l border-line pl-6">
                  {w.entries.map((e) => (
                    <li key={e.id} className="relative">
                      <span aria-hidden="true" className="absolute -left-[29px] top-2 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-app" />
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-ink">{e.title}</h4>
                        <Badge tone={tone[e.tag]}>{e.tag}</Badge>
                      </div>
                      {e.description && <p className="mt-1.5 text-[15px] leading-7 text-ink-3">{e.description}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </PageFrame>
  );
}
