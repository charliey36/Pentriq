import { withSentryConfig } from '@sentry/nextjs/config';

/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true,
  // Produces a minimal .next/standalone folder containing only the files
  // needed to run the app (server + resolved node_modules subset), so the
  // Docker image doesn't need to ship the full node_modules or source tree.
  output: 'standalone',
  // Always fetch fresh data when navigating between sections (no stale 30s page cache),
  // so clicking a sidebar item doesn't need a second refresh request.
  // instrumentationHook: loads src/instrumentation.ts (Sentry) on Next 14.
  experimental: { staleTimes: { dynamic: 0, static: 30 }, instrumentationHook: true },
  // The release id is baked into the browser bundle so frontend errors carry the same release as the server.
  // Baseline security headers on every response (no CSP yet: it needs testing against Stripe/Sentry/Google scripts).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
  env: { NEXT_PUBLIC_SENTRY_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA || '' },
};

// Source-map upload (readable stack traces) only happens when SENTRY_AUTH_TOKEN is set at build time;
// without it the build is unchanged and errors are still reported, just with minified stack traces.
export default withSentryConfig(baseConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA, create: Boolean(process.env.SENTRY_AUTH_TOKEN), finalize: Boolean(process.env.SENTRY_AUTH_TOKEN) },
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  disableLogger: true,
});
