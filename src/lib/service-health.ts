/**
 * Operational health checks behind GET /api/health.
 *
 * - liveness  ("is the process up?")   never touches a dependency, so an orchestrator doesn't restart the app
 *                                       just because the database is slow.
 * - readiness ("can it serve users?")  runs each dependency check under a hard timeout and reports per-check status.
 *
 * Responses never include secrets, hostnames or error text: only booleans, latency and a short reason code,
 * so the endpoint can be public (uptime monitors, load balancers) without leaking anything.
 */
export type CheckResult = { ok: boolean; latencyMs: number; reason?: string };
export type HealthReport = {
  status: 'ok' | 'degraded' | 'down';
  mode: 'live' | 'ready';
  release: string | null;
  uptimeSeconds: number;
  checks: Record<string, CheckResult>;
};

export type HealthCheck = { name: string; critical: boolean; run: () => Promise<void> };

const CHECK_TIMEOUT_MS = 3000;

async function timed(run: () => Promise<void>, timeoutMs: number): Promise<CheckResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, reason: e instanceof Error && e.message === 'timeout' ? 'timeout' : 'error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Critical failure => "down" (HTTP 503). Non-critical failure => "degraded" (HTTP 200, so a flaky extra doesn't trigger paging). */
export async function runHealth(
  mode: 'live' | 'ready',
  checks: HealthCheck[],
  opts: { release?: string | null; uptimeSeconds?: number; timeoutMs?: number } = {}
): Promise<HealthReport> {
  const results: Record<string, CheckResult> = {};
  if (mode === 'ready') {
    const settled = await Promise.all(checks.map((c) => timed(c.run, opts.timeoutMs ?? CHECK_TIMEOUT_MS)));
    checks.forEach((c, i) => (results[c.name] = settled[i]));
  }
  const criticalFailed = checks.some((c) => c.critical && results[c.name] && !results[c.name].ok);
  const anyFailed = Object.values(results).some((r) => !r.ok);
  return {
    status: criticalFailed ? 'down' : anyFailed ? 'degraded' : 'ok',
    mode,
    release: opts.release ?? null,
    uptimeSeconds: Math.round(opts.uptimeSeconds ?? process.uptime()),
    checks: results,
  };
}

export function httpStatusFor(report: HealthReport): number {
  return report.status === 'down' ? 503 : 200;
}
