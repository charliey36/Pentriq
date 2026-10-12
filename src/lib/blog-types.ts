/**
 * Blog content model. Articles are plain typed data (no CMS, no MDX), so every
 * page is statically generated at build time and reviewed in code.
 *
 * Inline markup supported inside any `text` / list item:
 *   **bold**   and   [link text](/internal-path or https://external)
 */
export type BlogBlock =
  | { t: 'h2'; text: string; id?: string }
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'callout'; title: string; text: string }
  /** A copy-and-paste example (message template, reply, etc.). */
  | { t: 'example'; title: string; lines: string[] };

export const BLOG_CATEGORIES = [
  'Google Reviews',
  'Google Business Profile',
  'Reputation Management',
  'Customer Feedback',
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export type BlogPost = {
  slug: string;
  /** On-page H1. */
  title: string;
  /** <title> tag (kept under ~60 characters). */
  seoTitle: string;
  /** Meta description (kept under ~155 characters). */
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
  /** Short summary shown on cards and under the H1. */
  excerpt: string;
  category: BlogCategory;
  keywords: string[];
  /** ISO dates (YYYY-MM-DD). */
  datePublished: string;
  dateModified: string;
  /** Slugs of other posts to feature in "Keep reading". */
  related: string[];
  /** Closing call-to-action. */
  cta: { title: string; text: string; label: string; href: string };
  body: BlogBlock[];
};
