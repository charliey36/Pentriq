import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { INDUSTRIES, industryBySlug } from '@/lib/industries';
import { PLAN } from '@/lib/billing';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ industry: i.slug }));
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ industry: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const i = industryBySlug(params.industry);
  if (!i) return {};
  return pageMetadata({
    title: `Review and rebooking software for ${i.plural.toLowerCase()}`,
    description: `${i.headline}. Automatic Google review requests, rebooking reminders and private feedback from ${PLAN.currency}${PLAN.priceMonthly} a month with a 30-day free trial.`,
    path: `/for/${i.slug}`,
  });
}

export default async function IndustryPage({ params: paramsPromise }: { params: Promise<{ industry: string }> }) {
  const params = await paramsPromise;
  const i = industryBySlug(params.industry);
  if (!i) notFound();

  return (
    <PageFrame eyebrow={`For ${i.plural.toLowerCase()}`} title={i.headline} intro={i.intro}>
      <JsonLd
        data={[
          breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'Industries', url: `${SITE_URL}/for` }, { name: i.plural, url: `${SITE_URL}/for/${i.slug}` }]),
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: i.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
          },
        ]}
      />
      <div className="flex flex-wrap gap-3">
        <Link href="/signup" className="btn btn-primary btn-lg">Start your free trial</Link>
        <Link href="/tools/review-gap-calculator" className="btn btn-secondary btn-lg">See your review gap</Link>
      </div>
      <p className="mt-3 text-sm text-ink-3">{PLAN.currency}{PLAN.priceMonthly} a month after a 30-day trial. No card needed to start.</p>

      <h2 className="mt-14 text-2xl font-semibold tracking-[-0.02em] text-ink">Sound familiar?</h2>
      <ul className="mt-4 space-y-3 text-[15px] leading-7 text-ink-2">
        {i.pains.map((p) => <li key={p}>• {p}</li>)}
      </ul>

      <h2 className="mt-14 text-2xl font-semibold tracking-[-0.02em] text-ink">What Pentriq does for your {i.noun}</h2>
      <ul className="mt-4 space-y-3 text-[15px] leading-7 text-ink-2">
        <li><strong>Asks for the review for you.</strong> One automatic request after the visit, plus two gentle reminders that stop the moment the customer responds.</li>
        <li><strong>Hears problems first.</strong> Every request includes a private feedback option, shown to everyone, so concerns reach you directly.</li>
        <li><strong>Brings customers back.</strong> {i.rebookingIdea}</li>
        <li><strong>Stays compliant.</strong> Consent is recorded, every email has an unsubscribe link, and you can export or delete data at any time.</li>
      </ul>

      <h2 className="mt-14 text-2xl font-semibold tracking-[-0.02em] text-ink">An example request</h2>
      <blockquote className="mt-4 rounded-xl border border-line bg-surface p-5 text-[15px] italic leading-7 text-ink-2">“{i.sampleAsk}”</blockquote>
      <p className="mt-2 text-sm text-ink-3">You can edit the wording, and Pentriq always shows the public review link and the private feedback option together.</p>

      <h2 className="mt-14 text-2xl font-semibold tracking-[-0.02em] text-ink">Ready-made services</h2>
      <p className="mt-3 text-[15px] leading-7 text-ink-3">Choose “{i.plural}” when you set up and Pentriq pre-fills these typical rebooking intervals. They are starting points; change them any time.</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-ink-4"><tr><th className="p-3">Service</th><th className="p-3">Typical reminder</th></tr></thead>
          <tbody>
            {i.services.map((s) => (
              <tr key={s.name} className="border-t border-line">
                <td className="p-3 text-ink">{s.name}</td>
                <td className="p-3 text-ink-3">{s.intervalDays > 0 ? `after about ${s.intervalDays} days` : 'one-off, review request only'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-14 text-2xl font-semibold tracking-[-0.02em] text-ink">Questions</h2>
      <dl className="mt-5 space-y-5">
        {i.faq.map(([q, a]) => (
          <div key={q}>
            <dt className="font-semibold text-ink">{q}</dt>
            <dd className="mt-1 text-[15px] leading-7 text-ink-3">{a}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-14 rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="text-lg font-semibold text-ink">Get set up in a few minutes</p>
        <p className="mt-1 text-sm text-ink-3">Finish setup and your free trial starts automatically.</p>
        <Link href="/signup" className="btn btn-primary mt-4">Start your free trial</Link>
      </div>
    </PageFrame>
  );
}
