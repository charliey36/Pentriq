'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/** Last-resort boundary for errors in the root layout; replaces the framework's blank error page. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Something went wrong</h1>
        <p style={{ color: '#5e6a81' }}>We have been notified. Please refresh the page, or try again in a minute.</p>
        {error.digest && <p style={{ color: '#8f9baf', fontSize: '0.8rem' }}>Reference: {error.digest}</p>}
      </body>
    </html>
  );
}
