import type { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/brand';

export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/about', '/contact', '/pricing', '/changelog', '/roadmap', '/login', '/signup', '/privacy', '/terms', '/cookies'],
        // Authenticated app, APIs and per-customer public pages are not for indexing.
        disallow: ['/api/', '/dashboard', '/customers', '/settings', '/reviews', '/analytics', '/feedback/', '/book/', '/r/', '/auth/', '/forgot-password', '/reset-password'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
