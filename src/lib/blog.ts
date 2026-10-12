import type { BlogPost } from '@/lib/blog-types';
import { DEFAULT_APP_URL } from '@/lib/brand';
import { post as getMoreReviews } from '@/content/blog/how-to-get-more-google-reviews';
import { post as profileGuide } from '@/content/blog/google-business-profile-guide';
import { post as reputation } from '@/content/blog/reputation-management-for-small-business';

/** Canonical origin for every blog URL and structured-data field. */
export const SITE_URL = DEFAULT_APP_URL;

/** Newest first. Add new articles here. */
export const POSTS: BlogPost[] = [getMoreReviews, profileGuide, reputation].sort((a, b) =>
  b.datePublished.localeCompare(a.datePublished)
);

export const getPost = (slug: string) => POSTS.find((p) => p.slug === slug);

export const postUrl = (slug: string) => `${SITE_URL}/blog/${slug}`;

export function relatedPosts(post: BlogPost): BlogPost[] {
  return post.related.map(getPost).filter((p): p is BlogPost => Boolean(p));
}

/** Plain text of an article body (markup stripped) for word counts. */
export function plainText(post: BlogPost): string {
  const parts: string[] = [];
  for (const b of post.body) {
    if ('text' in b) parts.push(b.text);
    if ('items' in b) parts.push(...b.items);
    if ('lines' in b) parts.push(...b.lines);
    if ('title' in b) parts.push(b.title);
  }
  return parts.join(' ').replace(/\*\*|\[([^\]]*)\]\([^)]*\)/g, '$1');
}

export const wordCount = (post: BlogPost) => plainText(post).split(/\s+/).filter(Boolean).length;

export const readingMinutes = (post: BlogPost) => Math.max(1, Math.round(wordCount(post) / 220));

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const slugifyHeading = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
