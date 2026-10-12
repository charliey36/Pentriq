import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/json-ld';
import { BlogShell } from '@/components/blog/blog-shell';
import { ArticleBody, headingsOf } from '@/components/blog/article-body';
import { Badge } from '@/components/ui/badge';
import { articleLd, breadcrumbLd } from '@/lib/seo';
import { POSTS, SITE_URL, formatDate, getPost, postUrl, readingMinutes, relatedPosts, wordCount } from '@/lib/blog';

type Props = { params: { slug: string } };

// Only the articles that exist are valid; everything else is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const post = getPost(params.slug);
  if (!post) return {};
  const url = postUrl(post.slug);
  return {
    title: { absolute: post.seoTitle },
    description: post.seoDescription,
    keywords: post.keywords,
    authors: [{ name: 'The Pentriq Team', url: SITE_URL }],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName: 'Pentriq',
      url,
      title: post.ogTitle,
      description: post.ogDescription,
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
      authors: ['The Pentriq Team'],
      section: post.category,
      tags: post.keywords,
    },
    twitter: { card: 'summary_large_image', title: post.ogTitle, description: post.ogDescription },
  };
}

export default function BlogPostPage({ params }: Props) {
  const post = getPost(params.slug);
  if (!post) notFound();

  const url = postUrl(post.slug);
  const headings = headingsOf(post.body);
  const related = relatedPosts(post, 3);

  const jsonLd = [
    articleLd({
      url,
      title: post.title,
      description: post.seoDescription,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      section: post.category,
      keywords: post.keywords,
      wordCount: wordCount(post),
    }),
    breadcrumbLd([
      { name: 'Home', url: SITE_URL },
      { name: 'Blog', url: `${SITE_URL}/blog` },
      { name: post.title, url },
    ]),
  ];

  return (
    <BlogShell>
      <JsonLd data={jsonLd} />

      <article>
        <header className="border-b border-line bg-surface/60">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <nav aria-label="Breadcrumb" className="text-sm text-ink-4">
              <ol className="flex flex-wrap items-center gap-1.5">
                <li>
                  <Link href="/" className="hover:text-ink">Home</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link href="/blog" className="hover:text-ink">Blog</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-ink-3">{post.category}</li>
              </ol>
            </nav>
            <div className="mt-5">
              <Badge tone="success">{post.category}</Badge>
            </div>
            <h1 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-[44px] sm:leading-[1.1]">
              {post.title}
            </h1>
            <p className="mt-5 text-pretty text-lg leading-8 text-ink-3">{post.excerpt}</p>
            <p className="mt-6 text-sm text-ink-4">
              By The Pentriq Team · Published <time dateTime={post.datePublished}>{formatDate(post.datePublished)}</time>
              {post.dateModified !== post.datePublished && (
                <>
                  {' '}· Updated <time dateTime={post.dateModified}>{formatDate(post.dateModified)}</time>
                </>
              )}{' '}
              · {readingMinutes(post)} min read
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <nav aria-label="Table of contents" className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">In this article</p>
            <ol className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="text-ink-3 hover:text-brand-700 dark:hover:text-brand-300">
                    {h.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <ArticleBody body={post.body} />

          <aside aria-label="Call to action" className="mt-14 rounded-2xl bg-brand-950 p-7 text-white sm:p-9">
            <h2 className="text-balance text-2xl font-semibold tracking-[-0.02em]">{post.cta.title}</h2>
            <p className="mt-3 text-brand-100/80">{post.cta.text}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={post.cta.href} className="btn btn-primary btn-lg">
                {post.cta.label}
              </Link>
              <Link href="/#features" className="btn btn-secondary btn-lg">
                See Pentriq features
              </Link>
            </div>
          </aside>

          <section aria-label="Explore Pentriq" className="mt-12">
            <h2 className="text-lg font-semibold text-ink">Explore Pentriq</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                ['Features', 'Review requests, feedback inbox, rebooking and analytics.', '/#features'],
                ['How it works', 'From first request to measured results in three steps.', '/#how-it-works'],
                ['Built for compliance', 'Public link and private feedback offered to everyone.', '/#compliance'],
              ].map(([label, text, href]) => (
                <li key={href}>
                  <Link href={href} className="card card-interactive block h-full p-4">
                    <span className="text-sm font-semibold text-ink">{label}</span>
                    <span className="mt-1 block text-sm text-ink-3">{text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {related.length > 0 && (
            <section aria-label="Keep reading" className="mt-12">
              <h2 className="text-lg font-semibold text-ink">Keep reading</h2>
              <ul className="mt-3 grid gap-4 sm:grid-cols-3">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/blog/${r.slug}`} className="card card-interactive block h-full p-5">
                      <Badge tone="neutral">{r.category}</Badge>
                      <span className="mt-3 block text-base font-semibold text-ink">{r.title}</span>
                      <span className="mt-1.5 block text-sm leading-6 text-ink-3">{r.excerpt}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </article>
    </BlogShell>
  );
}
