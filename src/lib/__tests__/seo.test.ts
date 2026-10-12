import { describe, expect, it } from '@jest/globals';
import { articleLd, breadcrumbLd, organizationLd, pageMetadata, websiteLd } from '@/lib/seo';

describe('structured data', () => {
  it('Organization has the required identity, address and contact fields', () => {
    const o = organizationLd() as Record<string, any>;
    expect(o['@type']).toBe('Organization');
    expect(o.url).toBe('https://pentriq.cloud');
    expect(o.email).toBe('hello@pentriq.cloud');
    expect(o.address).toMatchObject({ addressLocality: 'Poole', addressRegion: 'Dorset', addressCountry: 'GB' });
    expect(o.logo.url).toMatch(/^https:\/\/pentriq\.cloud\//);
  });
  it('WebSite points at the Organization', () => {
    const w = websiteLd() as Record<string, any>;
    expect(w['@type']).toBe('WebSite');
    expect(w.publisher['@id']).toBe('https://pentriq.cloud/#organization');
  });
  it('BlogPosting has the fields Google requires', () => {
    const a = articleLd({ url: 'https://pentriq.cloud/blog/x', title: 'T', description: 'D', datePublished: '2026-10-12', dateModified: '2026-10-12', section: 'S', keywords: ['a', 'b'], wordCount: 1600 }) as Record<string, any>;
    for (const k of ['headline', 'image', 'datePublished', 'author', 'publisher', 'mainEntityOfPage']) expect(a[k]).toBeTruthy();
    expect(a.keywords).toBe('a, b');
  });
  it('Breadcrumb positions are sequential from 1', () => {
    const b = breadcrumbLd([{ name: 'A', url: 'u1' }, { name: 'B', url: 'u2' }]) as Record<string, any>;
    expect(b.itemListElement.map((i: any) => i.position)).toEqual([1, 2]);
  });
});

describe('pageMetadata', () => {
  it('builds canonical and Open Graph on https://pentriq.cloud', () => {
    const m = pageMetadata({ title: 'About Pentriq', description: 'd', path: '/about' }) as any;
    expect(m.alternates.canonical).toBe('https://pentriq.cloud/about');
    expect(m.openGraph.url).toBe('https://pentriq.cloud/about');
    expect(m.openGraph.title).toBeTruthy();
    expect(m.openGraph.description).toBe('d');
  });
  it('home canonical has no trailing path', () => {
    expect((pageMetadata({ title: 'x', description: 'd', path: '/' }) as any).alternates.canonical).toBe('https://pentriq.cloud');
  });
});
