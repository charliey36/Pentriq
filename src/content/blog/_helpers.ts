import type { BlogBlock } from '@/lib/blog-types';

/** Terse block builders so article files stay readable. */
export const h2 = (text: string, id?: string): BlogBlock => ({ t: 'h2', text, id });
export const h3 = (text: string): BlogBlock => ({ t: 'h3', text });
export const p = (text: string): BlogBlock => ({ t: 'p', text });
export const ul = (...items: string[]): BlogBlock => ({ t: 'ul', items });
export const ol = (...items: string[]): BlogBlock => ({ t: 'ol', items });
export const callout = (title: string, text: string): BlogBlock => ({ t: 'callout', title, text });
export const example = (title: string, ...lines: string[]): BlogBlock => ({ t: 'example', title, lines });
