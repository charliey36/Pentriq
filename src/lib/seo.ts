import type { Metadata } from 'next';
import { APP_DESCRIPTION } from '@/lib/brand';
import { ORG, SITE_URL } from '@/lib/site';

/** Complete, self-consistent metadata for a public page (title, description, canonical, Open Graph, Twitter). */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  /** Use the title verbatim (skip the "· Pentriq" suffix). */
  absoluteTitle?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  noindex?: boolean;
}): Metadata {
  const url = `${SITE_URL}${opts.path === '/' ? '' : opts.path}`;
  const ogTitle = opts.ogTitle ?? (opts.absoluteTitle ? opts.title : `${opts.title} · Pentriq`);
  const ogDescription = opts.ogDescription ?? opts.description;
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: ORG.name, url, title: ogTitle, description: ogDescription },
    twitter: { card: 'summary', title: ogTitle, description: ogDescription },
    ...(opts.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

export const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: ORG.name,
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: ORG.logo },
  email: ORG.email,
  description: APP_DESCRIPTION,
  address: {
    '@type': 'PostalAddress',
    addressLocality: ORG.locality,
    addressRegion: ORG.region,
    addressCountry: ORG.countryCode,
  },
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: ORG.email, areaServed: 'GB', availableLanguage: 'English' }],
});

export const websiteLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: SITE_URL,
  name: ORG.name,
  description: APP_DESCRIPTION,
  inLanguage: 'en-GB',
  publisher: { '@id': `${SITE_URL}/#organization` },
});

export const breadcrumbLd = (items: { name: string; url: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
});

export const articleLd = (a: {
  url: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  section: string;
  keywords: string[];
  wordCount: number;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  '@id': `${a.url}#article`,
  mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
  headline: a.title,
  description: a.description,
  image: [`${a.url}/opengraph-image`],
  datePublished: a.datePublished,
  dateModified: a.dateModified,
  articleSection: a.section,
  keywords: a.keywords.join(', '),
  wordCount: a.wordCount,
  inLanguage: 'en-GB',
  author: { '@type': 'Organization', name: 'The Pentriq Team', url: SITE_URL },
  publisher: { '@id': `${SITE_URL}/#organization` },
});
