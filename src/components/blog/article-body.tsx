import type { BlogBlock } from '@/lib/blog-types';
import { slugifyHeading } from '@/lib/blog';
import { Inline } from '@/components/blog/inline';

export function headingsOf(body: BlogBlock[]) {
  return body
    .filter((b): b is Extract<BlogBlock, { t: 'h2' }> => b.t === 'h2')
    .map((b) => ({ id: b.id ?? slugifyHeading(b.text), text: b.text }));
}

/** Renders typed article blocks with readable long-form typography. */
export function ArticleBody({ body }: { body: BlogBlock[] }) {
  return (
    <div className="text-[17px] leading-8 text-ink-2">
      {body.map((b, i) => {
        switch (b.t) {
          case 'h2':
            return (
              <h2
                key={i}
                id={b.id ?? slugifyHeading(b.text)}
                className="mt-14 scroll-mt-24 text-balance text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px] sm:leading-9"
              >
                {b.text}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={i} className="mt-8 text-lg font-semibold tracking-[-0.015em] text-ink sm:text-xl">
                {b.text}
              </h3>
            );
          case 'p':
            return (
              <p key={i} className="mt-5">
                <Inline text={b.text} />
              </p>
            );
          case 'ul':
            return (
              <ul key={i} className="mt-5 list-disc space-y-3 pl-6 marker:text-brand-600">
                {b.items.map((it, j) => (
                  <li key={j} className="pl-1">
                    <Inline text={it} />
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="mt-5 list-decimal space-y-3 pl-6 marker:font-semibold marker:text-brand-600">
                {b.items.map((it, j) => (
                  <li key={j} className="pl-1">
                    <Inline text={it} />
                  </li>
                ))}
              </ol>
            );
          case 'callout':
            return (
              <aside
                key={i}
                className="mt-8 rounded-xl bg-brand-50 p-5 text-[16px] leading-7 text-brand-900 ring-1 ring-brand-600/15 dark:bg-brand-500/10 dark:text-brand-100 dark:ring-brand-400/20"
              >
                <p className="font-semibold text-brand-900 dark:text-brand-100">{b.title}</p>
                <p className="mt-1.5">
                  <Inline text={b.text} />
                </p>
              </aside>
            );
          case 'example':
            return (
              <figure key={i} className="mt-8 overflow-hidden rounded-xl border border-line bg-surface-subtle">
                <figcaption className="border-b border-line px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                  {b.title}
                </figcaption>
                <div className="space-y-1 px-5 py-4 text-[15px] leading-7 text-ink-2">
                  {b.lines.map((l, j) => (l === '' ? <div key={j} className="h-3" /> : <p key={j}>{l}</p>))}
                </div>
              </figure>
            );
        }
      })}
    </div>
  );
}
