import Link from 'next/link';
import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { ROADMAP } from '@/content/roadmap';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

export const metadata = pageMetadata({
  title: 'Roadmap',
  description: 'See what Pentriq has shipped, what we are building now and what is planned next, including Google Business Profile integration and AI review insights.',
  path: '/roadmap',
});

export default function RoadmapPage() {
  return (
    <PageFrame
      eyebrow="Roadmap"
      title="What we’re building"
      intro="A public view of what is done, what is underway and what is coming next. Plans can change as we learn from customers."
      wide
    >
      <JsonLd data={breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'Roadmap', url: `${SITE_URL}/roadmap` }])} />
      <div className="grid gap-6 lg:grid-cols-3">
        {ROADMAP.map((col) => (
          <section key={col.status} aria-labelledby={`rm-${col.status}`} className="rounded-2xl border border-line bg-surface-subtle/60 p-5">
            <h2 id={`rm-${col.status}`} className="text-lg font-semibold text-ink">
              <span aria-hidden="true">{col.icon}</span> {col.label}
            </h2>
            <ul className="mt-4 space-y-3">
              {col.items.map((it) => (
                <li key={it.title} className="card p-4">
                  <p className="text-sm font-semibold text-ink">{it.title}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-3">{it.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-10 text-[15px] text-ink-3">
        Have a suggestion? <Link href="/contact" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">Tell us</Link>, or see what already shipped in the{' '}
        <Link href="/changelog" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">changelog</Link>.
      </p>
    </PageFrame>
  );
}
