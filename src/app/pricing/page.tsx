import Link from 'next/link';
import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { PLAN } from '@/lib/billing';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

export const metadata = pageMetadata({
  title: 'Pricing',
  description: `Pentriq costs ${PLAN.currency}${PLAN.priceMonthly} a month with a 14-day free trial. Unlimited customers and review requests, follow-up reminders, feedback inbox and analytics.`,
  path: '/pricing',
});

const faqs = [
  ['Is there a free trial?', 'Yes. Once you have created an account you can start a 14-day free trial from the Billing page whenever you are ready. It does not start automatically, and no card is needed to start it.'],
  ['Can I cancel any time?', 'Yes. You can cancel from the Stripe customer portal on the Billing page, and keep access until the end of the period you have paid for.'],
  ['How do I pay?', 'Payments are handled by Stripe Checkout. Pentriq never sees or stores your card details.'],
  ['What happens if my trial ends?', 'You can still sign in and view your data, but sending review requests and reminders pauses until you subscribe.'],
];

export default function PricingPage() {
  return (
    <PageFrame eyebrow="Pricing" title="One simple plan" intro="Everything you need to collect reviews, hear private feedback and bring customers back. No tiers to decode.">
      <JsonLd
        data={[
          breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'Pricing', url: `${SITE_URL}/pricing` }]),
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Pentriq',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: SITE_URL,
            offers: {
              '@type': 'Offer',
              price: String(PLAN.priceMonthly),
              priceCurrency: 'GBP',
              url: `${SITE_URL}/pricing`,
              availability: 'https://schema.org/InStock',
            },
          },
        ]}
      />
      <div className="card mx-auto max-w-md p-8 shadow-pop">
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{PLAN.name}</p>
        <p className="mt-3 text-5xl font-semibold tracking-tight text-ink">
          {PLAN.currency}{PLAN.priceMonthly}
          <span className="text-base font-normal text-ink-3"> / month</span>
        </p>
        <p className="mt-2 text-sm text-ink-3">14-day free trial. Cancel any time.</p>
        <ul className="mt-6 space-y-2.5 text-[15px] text-ink-2">
          {PLAN.perks.map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
        <Link href="/signup" className="btn btn-primary btn-lg mt-8 w-full">Start your free trial</Link>
      </div>

      <div className="mt-14">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Questions</h2>
        <dl className="mt-5 space-y-5">
          {faqs.map(([q, a]) => (
            <div key={q}>
              <dt className="font-semibold text-ink">{q}</dt>
              <dd className="mt-1 text-[15px] leading-7 text-ink-3">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-[15px] text-ink-3">
          Want to see what is included first? Browse the <Link href="/#features" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">features</Link> or
          read our <Link href="/blog/how-to-get-more-google-reviews" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">guide to getting more Google reviews</Link>.
        </p>
      </div>
    </PageFrame>
  );
}
