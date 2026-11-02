import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Review link unavailable · ${APP_NAME}`,
  robots: { index: false },
};

export default async function ReviewUnavailablePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const invalidLink = searchParams.reason === 'invalid-link';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div
        aria-hidden="true"
        className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <div className="relative flex flex-col items-center">
        <Link href="/" aria-label={`${APP_NAME} home`}>
          <Logo />
        </Link>
        <h1 className="mt-14 text-3xl font-semibold tracking-[-0.025em] text-ink sm:text-4xl">
          {invalidLink ? "We couldn't find that review link" : 'Review destination not set up yet'}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-ink-3">
          {invalidLink
            ? 'This review link is no longer valid. Please contact the business that sent it and ask them to send you a new one.'
            : "The business that sent you this link hasn't finished configuring where reviews should go (their Google review link is missing). Thank you for your time. Please let them know, or try again later."}
        </p>
        <p className="mt-6 text-xs text-ink-3">Sent via {APP_NAME}</p>
      </div>
    </main>
  );
}
