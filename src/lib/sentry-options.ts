import type { ErrorEvent } from '@sentry/nextjs';

/**
 * Shared Sentry options for the server, edge and browser runtimes.
 * Inert when no DSN is set (local dev, tests), so it is safe to leave on everywhere.
 */
export const sentryOptions = (dsn: string | undefined) => ({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
  // Errors only: no performance tracing, replays or logs, to keep cost and overhead near zero.
  tracesSampleRate: 0,
  // Never attach IPs, cookies or request bodies (customer names/emails flow through forms).
  sendDefaultPii: false,
  beforeSend: scrub,
});

/** Strip query strings (cron endpoints accept ?secret=…) and any cookies/body that slipped in. */
export function scrub(event: ErrorEvent): ErrorEvent {
  const req = event.request;
  if (req) {
    delete req.cookies;
    delete req.data;
    delete req.query_string;
    if (req.url) req.url = req.url.split('?')[0];
    if (req.headers) {
      for (const h of Object.keys(req.headers)) if (/^(authorization|cookie|x-api-key|stripe-signature)$/i.test(h)) delete req.headers[h];
    }
  }
  return event;
}
