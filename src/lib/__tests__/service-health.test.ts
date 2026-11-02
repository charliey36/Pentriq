import { httpStatusFor, runHealth } from '@/lib/service-health';

const ok = async () => undefined;
const fail = async () => { throw new Error('connection string postgres://secret'); };
const hang = () => new Promise<void>(() => undefined);

describe('service health', () => {
  it('liveness runs no checks, even a failing one', async () => {
    const report = await runHealth('live', [{ name: 'database', critical: true, run: fail }]);
    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({});
  });

  it('is ok when every check passes', async () => {
    const report = await runHealth('ready', [{ name: 'database', critical: true, run: ok }]);
    expect(report.status).toBe('ok');
    expect(httpStatusFor(report)).toBe(200);
  });

  it('is down (503) when a critical check fails, and never leaks the error text', async () => {
    const report = await runHealth('ready', [{ name: 'database', critical: true, run: fail }]);
    expect(report.status).toBe('down');
    expect(httpStatusFor(report)).toBe(503);
    expect(JSON.stringify(report)).not.toContain('postgres');
    expect(report.checks.database.reason).toBe('error');
  });

  it('is only degraded (200) when a non-critical check fails', async () => {
    const report = await runHealth('ready', [
      { name: 'database', critical: true, run: ok },
      { name: 'email', critical: false, run: fail },
    ]);
    expect(report.status).toBe('degraded');
    expect(httpStatusFor(report)).toBe(200);
  });

  it('times out a hanging dependency instead of hanging the endpoint', async () => {
    const report = await runHealth('ready', [{ name: 'database', critical: true, run: hang }], { timeoutMs: 20 });
    expect(report.status).toBe('down');
    expect(report.checks.database).toMatchObject({ ok: false, reason: 'timeout' });
  });
});
