import type { Metadata } from 'next';
import Link from 'next/link';
import { BlogShell } from '@/components/blog/blog-shell';
import { BlogIndex, type BlogCardData } from '@/components/blog/blog-index';
import { ResourceLinks } from '@/components/marketing/resource-links';
import { POSTS, SITE_URL, readingMinutes } from '@/lib/blog';

const TITLE = 'Pentriq Blog: Google Reviews & Reputation Management Guides';
const DESCRIPTION =
  'Practical guides on getting more Google reviews, optimising your Google Business Profile, collecting customer feedback and managing your reputation.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    type: 'website',
    siteName: 'Pentriq',
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/blog`,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export default function BlogPage() {
  const cards: BlogCardData[] = POSTS.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    category: p.category,
    date: p.datePublished,
    minutes: readingMinutes(p),
    keywords: p.keywords,
    featured: p.featured,
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${SITE_URL}/blog#blog`,
    url: `${SITE_URL}/blog`,
    name: 'Pentriq Blog',
    description: DESCRIPTION,
    publisher: { '@type': 'Organization', name: 'Pentriq', url: SITE_URL },
    blogPost: POSTS.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.datePublished,
      dateModified: p.dateModified,
    })),
  };

  return (
    <BlogShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <section className="border-b border-line bg-surface/60">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <p className="eyebrow text-brand-700 dark:text-brand-400">The Pentriq blog</p>
          <h1 className="mt-3 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.035em] text-ink sm:text-5xl">
            Grow your reputation, one review at a time
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-8 text-ink-3">
            Practical, policy-safe guides on Google reviews, your Google Business Profile, customer feedback and
            reputation management for small businesses.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <ResourceLinks current="/blog" />
        <BlogIndex posts={cards} />

        <section aria-label="About Pentriq" className="mt-16 rounded-2xl bg-brand-950 p-8 text-white sm:p-10">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Put these guides into practice with Pentriq</h2>
          <p className="mt-3 max-w-2xl text-brand-100/80">
            Automatic review requests with reminders, a private feedback inbox on every request, and analytics that
            show how your reviews and rating are trending.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start your free trial
            </Link>
            <Link href="/#features" className="btn btn-secondary btn-lg">
              Explore features
            </Link>
          </div>
        </section>
      </div>
    </BlogShell>
  );
}
