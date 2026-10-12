import Link from 'next/link';
import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { ORG, ORG_LOCATION, SITE_URL } from '@/lib/site';

export const metadata = pageMetadata({
  title: 'About Pentriq',
  description: 'Pentriq helps service businesses collect honest Google reviews, hear private feedback and bring customers back. Based in Poole, Dorset, UK.',
  path: '/about',
});

const principles = [
  ['Honest reviews only', 'Every request offers the public review link and a private feedback option to everyone. We never gate reviews by predicted sentiment, offer incentives, or help fabricate reviews.'],
  ['Small-business first', 'Pentriq is built for owner-run service businesses: salons, trades, clinics, studios and local shops, not enterprise marketing teams.'],
  ['Explainable numbers', 'Click tracking filters out bots and link scanners, and health scores use simple recency, frequency and spend rules you can understand.'],
  ['Straightforward pricing', 'One plan, one price, a free trial, and cancel any time from the Stripe customer portal.'],
];

export default function AboutPage() {
  return (
    <PageFrame
      eyebrow="About"
      title="Reputation tools that stay on the right side of the rules"
      intro="Pentriq is an AI-powered reputation management platform that helps businesses collect, monitor, analyse and improve customer reviews, with retention and rebooking built in."
    >
      <JsonLd
        data={[
          breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'About', url: `${SITE_URL}/about` }]),
          { '@context': 'https://schema.org', '@type': 'AboutPage', url: `${SITE_URL}/about`, name: 'About Pentriq', about: { '@id': `${SITE_URL}/#organization` } },
        ]}
      />
      <div className="space-y-12 text-[17px] leading-8 text-ink-2">
        <section>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">What Pentriq does</h2>
          <p className="mt-4">
            Most happy customers never leave a review unless someone asks, and unhappy ones often tell you nowhere you can fix it.
            Pentriq closes both gaps. It sends review requests with automatic reminders, gives customers a private feedback route, reminds
            customers when they are due to rebook, and shows you how your reviews and rating are trending. See the full list on the{' '}
            <Link href="/#features" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">features overview</Link>.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">What we believe</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {principles.map(([t, d]) => (
              <li key={t} className="card p-5">
                <p className="text-base font-semibold text-ink">{t}</p>
                <p className="mt-2 text-[15px] leading-7 text-ink-3">{d}</p>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Where we are</h2>
          <p className="mt-4">
            Pentriq is based in {ORG_LOCATION}. You can reach us at{' '}
            <a href={`mailto:${ORG.email}`} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">{ORG.email}</a>{' '}
            or on the <Link href="/contact" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">contact page</Link>.
            We publish what we are building on the <Link href="/roadmap" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">roadmap</Link> and
            what has shipped in the <Link href="/changelog" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">changelog</Link>.
          </p>
        </section>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className="btn btn-primary btn-lg">Start your free trial</Link>
          <Link href="/pricing" className="btn btn-secondary btn-lg">See pricing</Link>
        </div>
      </div>
    </PageFrame>
  );
}
