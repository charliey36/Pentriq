import type { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/brand';
import { POSTS } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  const now = new Date();
  const pages: MetadataRoute.Sitemap = ['/', '/pricing', '/tools/review-gap-calculator', '/about', '/contact', '/changelog', '/roadmap', '/login', '/signup', '/privacy', '/terms', '/cookies'].map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    lastModified: now,
  }));

  const latest = POSTS.map((p) => p.dateModified).sort().pop();
  const blog: MetadataRoute.Sitemap = [
    {
      url: `${base}/blog`,
      lastModified: latest ? new Date(latest) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...POSTS.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.dateModified),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  return [...pages, ...blog];
}
