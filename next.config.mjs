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
  experimental: { staleTimes: { dynamic: 0, static: 30 } },
  // The Email tab moved to the Admin Portal; keep old bookmarks and links working.
  async redirects() {
    return [
      { source: '/settings/email/preview', destination: '/admin/email-preview', permanent: true },
      { source: '/settings/email/:path*', destination: '/admin/email-usage', permanent: true },
      { source: '/settings/email', destination: '/admin/email-usage', permanent: true },
    ];
  },
  /*
   * Security headers on every response.
   * - An ENFORCED Content-Security-Policy with only the directives that cannot break Stripe, Supabase, Sentry or
   *   Google flows: no plugins, no <base> hijacking, no framing by other sites (the widget alone may be framed).
   * - The full policy runs in REPORT-ONLY mode and reports violations to /api/csp-report (logged as
   *   security/csp_violation). Promote it to enforcing once production traffic shows no violations from
   *   legitimate sources (see docs/RELEASE_READINESS.md, human actions).
   */
  async headers() {
    const reportOnly = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://api.stripe.com",
      'report-uri /api/csp-report',
      'report-to csp-endpoint',
    ].join('; ');
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
    ];
    return [
      // The review widget is meant to be embedded on other sites, so it alone omits the framing restriction.
      {
        source: '/widget/:path*',
        headers: [...common, { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'" }],
      },
      {
        source: '/:path((?!widget/).*)',
        headers: [
          ...common,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.stripe.com")' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
          { key: 'Content-Security-Policy-Report-Only', value: reportOnly },
        ],
      },
    ];
  },
  // The release id is baked into the browser bundle so frontend errors carry the same release as the server.
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
