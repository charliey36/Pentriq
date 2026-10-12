import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ORG } from '@/lib/site';
import { SiteFooter } from '@/components/marketing/site-footer';

export const CONTACT_EMAIL = ORG.email;

/** Static legal page frame. Content is placeholder text: have it reviewed before launch. */
export function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: { heading: string; body: string[] }[];
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-3xl px-4 py-6">
        <Link href="/" aria-label="Pentriq home"><Logo /></Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-4">Last updated: October 2026</p>
        {sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="text-lg font-semibold text-ink">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 text-[15px] leading-7 text-ink-2">{p}</p>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
