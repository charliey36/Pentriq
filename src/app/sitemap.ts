import type { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/brand';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  return ['/', '/login', '/signup', '/privacy', '/terms', '/cookies'].map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    lastModified: new Date(),
  }));
}
