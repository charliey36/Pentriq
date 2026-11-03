import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    // One line at boot naming any missing production configuration (names only, never values), so a
    // misconfigured deployment shows up in the logs immediately rather than on the first failed send.
    if (process.env.NODE_ENV === 'production') {
      const { evaluateConfig, summarise } = await import('@/lib/launch-readiness');
      const checks = evaluateConfig(process.env, { production: true });
      const summary = summarise(checks);
      const failing = checks.filter((c) => c.status !== 'ok').map((c) => `${c.id}:${c.status}`);
      console.log(JSON.stringify({ area: 'settings', event: 'config_check', level: summary.ready ? 'info' : 'warn', ready: summary.ready, blockers: summary.blockers, failing }));
    }
  }
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

// Reports every uncaught error from server components, route handlers and server actions.
export const onRequestError = Sentry.captureRequestError;
