import Link from 'next/link';
import { Logo } from '@/components/logo';
import { LegalLinks } from '@/components/legal-links';
import { ORG, ORG_LOCATION } from '@/lib/site';

const columns: { title: string; links: [string, string][] }[] = [
  {
    title: 'Product',
    links: [
      ['Features', '/#features'],
      ['How it works', '/#how-it-works'],
      ['Pricing', '/pricing'],
      ['Blog', '/blog'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About', '/about'],
      ['Contact', '/contact'],
      ['Changelog', '/changelog'],
      ['Roadmap', '/roadmap'],
    ],
  },
  {
    title: 'Learn',
    links: [
      ['Get more Google reviews', '/blog/how-to-get-more-google-reviews'],
      ['Respond to negative reviews', '/blog/how-to-respond-to-negative-google-reviews'],
      ['Google Business Profile guide', '/blog/google-business-profile-guide'],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-6 text-ink-3">
              Reviews, feedback and rebooking for service businesses, with a private feedback option on every request.
            </p>
            <address className="mt-4 text-sm not-italic leading-6 text-ink-3">
              {ORG_LOCATION}
              <br />
              <a href={`mailto:${ORG.email}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                {ORG.email}
              </a>
            </address>
          </div>
          {columns.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-sm font-semibold text-ink">{c.title}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {c.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-ink-3 transition-colors hover:text-ink">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-ink-3">&copy; {new Date().getFullYear()} {ORG.name}. All rights reserved.</p>
          <LegalLinks />
        </div>
        <div className="mt-6 flex justify-center sm:justify-start">
          <a
            href="https://launchbuff.com/products/pentriq-m2o3ww"
            target="_blank"
            rel="noopener noreferrer"
            title="Featured on LaunchBuff"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://launchbuff.com/badge-featured-dark.svg"
              alt="Featured on LaunchBuff"
              width="256"
              height="80"
              className="h-auto w-32 opacity-90 transition-opacity hover:opacity-100"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
