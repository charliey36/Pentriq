import type { BlogPost } from '@/lib/blog-types';
import { SITE_URL } from '@/lib/site';
import { post as getMoreReviews } from '@/content/blog/how-to-get-more-google-reviews';
import { post as profileGuide } from '@/content/blog/google-business-profile-guide';
import { post as reputation } from '@/content/blog/reputation-management-for-small-business';
import { post as respondNegative } from '@/content/blog/how-to-respond-to-negative-google-reviews';
import { post as templates } from '@/content/blog/google-review-request-templates';
import { post as verification } from '@/content/blog/google-business-profile-verification-guide';
import { post as howMany } from '@/content/blog/how-many-google-reviews-does-a-business-need';
import { post as software } from '@/content/blog/best-reputation-management-software-for-small-businesses';

export { SITE_URL };

/** Newest first. Add new articles here. */
export const POSTS: BlogPost[] = [getMoreReviews, profileGuide, reputation, respondNegative, templates, verification, howMany, software].sort(
  (a, b) => b.datePublished.localeCompare(a.datePublished) || Number(!!b.featured) - Number(!!a.featured)
);

export const getPost = (slug: string) => POSTS.find((p) => p.slug === slug);

export const postUrl = (slug: string) => `${SITE_URL}/blog/${slug}`;

/** Curated related posts first, then same-category posts, then the newest others (3 total). */
export function relatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  const picked = post.related.map(getPost).filter((p): p is BlogPost => Boolean(p));
  const rest = POSTS.filter((p) => p.slug !== post.slug && !picked.includes(p));
  rest.sort((a, b) => Number(b.category === post.category) - Number(a.category === post.category));
  return [...picked, ...rest].slice(0, limit);
}

export const featuredPosts = (limit = 3) => POSTS.filter((p) => p.featured).slice(0, limit);

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
