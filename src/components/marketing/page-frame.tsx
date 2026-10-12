import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

/** Shared frame for public marketing/trust pages. */
export function PageFrame({
  eyebrow,
  title,
  intro,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen overflow-x-clip">
      <SiteHeader />
      <main>
        <section className="border-b border-line bg-surface/60">
          <div className={`mx-auto px-4 py-14 sm:px-6 sm:py-20 ${wide ? 'max-w-6xl lg:px-8' : 'max-w-3xl'}`}>
            <p className="eyebrow text-brand-700 dark:text-brand-400">{eyebrow}</p>
            <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.035em] text-ink sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-pretty text-lg leading-8 text-ink-3">{intro}</p>
          </div>
        </section>
        <div className={`mx-auto px-4 py-12 sm:px-6 sm:py-16 ${wide ? 'max-w-6xl lg:px-8' : 'max-w-3xl'}`}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
