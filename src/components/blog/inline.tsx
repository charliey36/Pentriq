import Link from 'next/link';
import type { ReactNode } from 'react';

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

/**
 * Renders the tiny inline markup used in blog copy (**bold** and [links](href))
 * as real React elements. No HTML is ever injected.
 */
export function Inline({ text }: { text: string }): ReactNode {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      const external = /^https?:\/\//.test(href);
      const cls = 'font-medium text-brand-700 underline decoration-brand-600/30 underline-offset-2 hover:decoration-brand-600 dark:text-brand-300';
      return external ? (
        <a key={i} href={href} className={cls} rel="noopener noreferrer" target="_blank">
          {label}
        </a>
      ) : (
        <Link key={i} href={href} className={cls}>
          {label}
        </Link>
      );
    }
    return part;
  });
}
