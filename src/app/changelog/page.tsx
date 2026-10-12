import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { CHANGELOG } from '@/content/changelog';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

export const metadata = pageMetadata({
  title: 'Changelog',
  description: 'What is new in Pentriq: product updates, billing, analytics and infrastructure changes, newest first.',
  path: '/changelog',
});

const tone: Record<string, BadgeTone> = { New: 'success', Improved: 'info', Infrastructure: 'neutral' };
const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function ChangelogPage() {
  return (
    <PageFrame eyebrow="Changelog" title="What’s new in Pentriq" intro="A running record of what we have shipped, newest first.">
      <JsonLd data={breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'Changelog', url: `${SITE_URL}/changelog` }])} />
      <div className="space-y-12">
        {CHANGELOG.map((m) => (
          <section key={m.month} aria-labelledby={m.month.replace(/\s/g, '-')}>
            <h2 id={m.month.replace(/\s/g, '-')} className="text-2xl font-semibold tracking-[-0.02em] text-ink">{m.month}</h2>
            <ol className="mt-5 space-y-4 border-l border-line pl-6">
              {m.entries.map((e) => (
                <li key={e.title} className="relative">
                  <span aria-hidden="true" className="absolute -left-[29px] top-2 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-app" />
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{e.title}</h3>
                    <Badge tone={tone[e.tag]}>{e.tag}</Badge>
                    <time dateTime={e.date} className="text-xs text-ink-4">{fmt(e.date)}</time>
                  </div>
                  <p className="mt-1.5 text-[15px] leading-7 text-ink-3">{e.description}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </PageFrame>
  );
}
