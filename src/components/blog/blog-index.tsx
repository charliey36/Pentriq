'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { BLOG_CATEGORIES, type BlogCategory } from '@/lib/blog-types';

export type BlogCardData = {
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  date: string;
  minutes: number;
  keywords: string[];
  featured?: boolean;
};

const ALL = 'All' as const;

function Card({ post, featured = false }: { post: BlogCardData; featured?: boolean }) {
  return (
    <article
      className={`card card-interactive group relative flex flex-col p-6 ${featured ? 'sm:p-8 lg:flex-row lg:items-center lg:gap-10' : ''}`}
    >
      <div className={featured ? 'lg:flex-1' : ''}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">{post.category}</Badge>
          {featured && <Badge tone="info">Featured</Badge>}
        </div>
        <h2 className={`mt-3 text-balance font-semibold tracking-[-0.02em] text-ink ${featured ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {post.title}
          </Link>
        </h2>
        <p className="mt-3 text-pretty text-[15px] leading-7 text-ink-3">{post.excerpt}</p>
        <p className="mt-4 text-xs text-ink-4">
          <time dateTime={post.date}>{new Date(`${post.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</time>
          {' · '}
          {post.minutes} min read
        </p>
      </div>
      <span className="mt-5 inline-flex items-center text-sm font-medium text-brand-700 group-hover:underline dark:text-brand-300 lg:mt-0">
        Read article <span aria-hidden="true" className="ml-1">→</span>
      </span>
    </article>
  );
}

/** Blog landing: featured article, search and category filter, article cards. */
export function BlogIndex({ posts }: { posts: BlogCardData[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<BlogCategory | typeof ALL>(ALL);

  const filtering = query.trim() !== '' || category !== ALL;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (category !== ALL && p.category !== category) return false;
      if (!q) return true;
      return [p.title, p.excerpt, p.category, ...p.keywords].join(' ').toLowerCase().includes(q);
    });
  }, [posts, query, category]);

  const featuredAll = posts.filter((p) => p.featured);
  const [featured, ...moreFeatured] = featuredAll.length ? featuredAll : posts.slice(0, 1);
  const shown = new Set([featured, ...moreFeatured].filter(Boolean).map((p) => p.slug));
  const rest = posts.filter((p) => !shown.has(p.slug));
  const counts = useMemo(
    () => Object.fromEntries(BLOG_CATEGORIES.map((c) => [c, posts.filter((p) => p.category === c).length])),
    [posts]
  );

  return (
    <div>
      {!filtering && featured && (
        <section aria-label="Featured article" className="mb-10">
          <Card post={featured} featured />
        </section>
      )}

      {!filtering && moreFeatured.length > 0 && (
        <section aria-labelledby="featured-guides" className="mb-12">
          <h2 id="featured-guides" className="text-lg font-semibold text-ink">Featured guides</h2>
          <ul className="mt-4 grid gap-5 md:grid-cols-2">
            {moreFeatured.map((p) => (
              <li key={p.slug} className="flex">
                <div className="flex w-full">
                  <Card post={p} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {[ALL, ...BLOG_CATEGORIES].map((c) => {
            const active = category === c;
            const count = c === ALL ? posts.length : counts[c];
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c as BlogCategory | typeof ALL)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ${
                  active
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-surface text-ink-2 ring-line-strong/70 hover:bg-surface-muted'
                }`}
              >
                {c}
                <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-ink-4'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="w-full sm:max-w-xs">
          <label htmlFor="blog-search" className="sr-only">
            Search articles
          </label>
          <input
            id="blog-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
            className="input w-full"
            autoComplete="off"
          />
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-4" aria-live="polite">
        {filtering ? `${results.length} article${results.length === 1 ? '' : 's'} found` : 'More articles'}
      </p>

      {(filtering ? results : rest).length > 0 ? (
        <ul className="mt-3 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {(filtering ? results : rest).map((p) => (
            <li key={p.slug} className="flex">
              <div className="flex w-full">
                <Card post={p} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card mt-3 p-8 text-center">
          <p className="text-base font-semibold text-ink">No articles match your search.</p>
          <p className="mt-1 text-sm text-ink-3">Try a different keyword or clear the category filter.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory(ALL);
            }}
            className="btn btn-secondary btn-sm mt-4"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
