import Link from 'next/link';

const LINKS = [
  ['Blog', '/blog'],
  ['Roadmap', '/roadmap'],
  ['Changelog', '/changelog'],
] as const;

/** Blog / Roadmap / Changelog switcher shown at the top of those three public pages. */
export function ResourceLinks({ current }: { current: (typeof LINKS)[number][1] }) {
  return (
    <nav aria-label="Resources" className="mb-8 flex flex-wrap gap-2">
      {LINKS.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={href === current ? 'page' : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            href === current ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-3 hover:text-ink'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
