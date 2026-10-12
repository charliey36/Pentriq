import { describe, expect, it } from '@jest/globals';
import { POSTS, SITE_URL, getPost, postUrl, wordCount } from '@/lib/blog';
import { BLOG_CATEGORIES } from '@/lib/blog-types';

describe('blog content', () => {
  it('has the three launch articles with unique slugs', () => {
    expect(POSTS.map((p) => p.slug).sort()).toEqual([
      'google-business-profile-guide',
      'how-to-get-more-google-reviews',
      'reputation-management-for-small-business',
    ]);
    expect(new Set(POSTS.map((p) => p.slug)).size).toBe(POSTS.length);
  });

  it.each(POSTS.map((p) => [p.slug, p] as const))('%s meets SEO requirements', (_slug, p) => {
    expect(wordCount(p)).toBeGreaterThanOrEqual(1500);
    expect(p.seoTitle.length).toBeLessThanOrEqual(60);
    expect(p.seoDescription.length).toBeLessThanOrEqual(160);
    expect(p.seoDescription.length).toBeGreaterThanOrEqual(100);
    expect(p.ogTitle.length).toBeGreaterThan(0);
    expect(p.ogDescription.length).toBeGreaterThan(0);
    expect(BLOG_CATEGORIES).toContain(p.category);
    expect(p.related.every((s) => getPost(s))).toBe(true);
    expect(p.cta.href.startsWith('/')).toBe(true);
  });

  it('uses https://pentriq.cloud for canonical URLs', () => {
    expect(SITE_URL).toBe('https://pentriq.cloud');
    expect(postUrl('google-business-profile-guide')).toBe('https://pentriq.cloud/blog/google-business-profile-guide');
  });

  it('links every article to Pentriq and to another article', () => {
    for (const p of POSTS) {
      const text = JSON.stringify(p.body);
      expect(text).toMatch(/\]\(\/blog\//);
      expect(text).toMatch(/\]\(\/#features\)/);
    }
  });
});
