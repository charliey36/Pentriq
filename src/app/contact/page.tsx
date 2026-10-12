import Link from 'next/link';
import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { ORG, ORG_LOCATION, SITE_URL } from '@/lib/site';

export const metadata = pageMetadata({
  title: 'Contact us',
  description: 'Get in touch with the Pentriq team for support, billing questions or feedback. Email hello@pentriq.cloud. Based in Poole, Dorset, UK.',
  path: '/contact',
});

export default function ContactPage() {
  const a = 'font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300';
  return (
    <PageFrame
      eyebrow="Contact"
      title="Talk to the Pentriq team"
      intro="Questions about your account, billing, a feature or a partnership? Send us an email and a real person will reply."
    >
      <JsonLd
        data={[
          breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'Contact', url: `${SITE_URL}/contact` }]),
          { '@context': 'https://schema.org', '@type': 'ContactPage', url: `${SITE_URL}/contact`, name: 'Contact Pentriq', about: { '@id': `${SITE_URL}/#organization` } },
        ]}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="card p-6">
          <p className="text-sm font-semibold text-ink">Email</p>
          <a href={`mailto:${ORG.email}`} className={`${a} mt-2 inline-block text-lg`}>{ORG.email}</a>
          <p className="mt-2 text-sm leading-6 text-ink-3">Support, billing, feedback and general enquiries.</p>
        </div>
        <div className="card p-6">
          <p className="text-sm font-semibold text-ink">Where we are</p>
          <address className="mt-2 text-lg not-italic text-ink-2">{ORG_LOCATION}</address>
          <p className="mt-2 text-sm leading-6 text-ink-3">Pentriq is a UK-based company.</p>
        </div>
      </div>

      <div className="mt-10 space-y-4 text-[16px] leading-7 text-ink-2">
        <h2 className="text-xl font-semibold text-ink">Before you write</h2>
        <ul className="list-disc space-y-2 pl-6 marker:text-brand-600">
          <li>Billing: you can update your card, download invoices or cancel yourself in <Link href="/login" className={a}>Settings → Billing</Link>.</li>
          <li>See what is planned on the <Link href="/roadmap" className={a}>roadmap</Link> and what has shipped in the <Link href="/changelog" className={a}>changelog</Link>.</li>
          <li>Learn the basics in our <Link href="/blog" className={a}>guides</Link>.</li>
          <li>Prices are on the <Link href="/pricing" className={a}>pricing page</Link>.</li>
        </ul>
        <p>To report a privacy concern, see our <Link href="/privacy" className={a}>Privacy Policy</Link>.</p>
      </div>
    </PageFrame>
  );
}
