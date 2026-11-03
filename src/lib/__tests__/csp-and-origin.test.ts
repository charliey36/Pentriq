/** @jest-environment node */
import { MAX_REPORT_BYTES, parseCspReport } from '../csp-report';
import { isSameOriginRequest } from '../same-origin';

describe('CSP report parsing', () => {
  it('reads the legacy report-uri format and strips query strings', () => {
    const body = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://pentriq.cloud/settings/billing?session=secret',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example/x.js?token=abc',
        'source-file': 'https://pentriq.cloud/_next/static/chunks/app.js',
        'line-number': 12,
        disposition: 'report',
      },
    });
    expect(parseCspReport(body)).toEqual([
      {
        directive: 'script-src-elem',
        blocked: 'https://evil.example/x.js',
        document: 'https://pentriq.cloud/settings/billing',
        source: 'https://pentriq.cloud/_next/static/chunks/app.js',
        line: 12,
        disposition: 'report',
      },
    ]);
  });

  it('reads the Reporting API format and ignores other report types', () => {
    const body = JSON.stringify([
      { type: 'csp-violation', body: { effectiveDirective: 'connect-src', blockedURL: 'https://x.example/api', documentURL: 'https://pentriq.cloud/', disposition: 'enforce' } },
      { type: 'deprecation', body: { id: 'x' } },
    ]);
    const out = parseCspReport(body);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ directive: 'connect-src', blocked: 'https://x.example/api', disposition: 'enforce' });
  });

  it('keeps keyword sources and rejects junk, oversize and malformed bodies', () => {
    expect(parseCspReport(JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } }))[0].blocked).toBe('inline');
    expect(parseCspReport('not json')).toEqual([]);
    expect(parseCspReport('{}')).toEqual([]);
    expect(parseCspReport('x'.repeat(MAX_REPORT_BYTES + 1))).toEqual([]);
    expect(parseCspReport(JSON.stringify(Array(50).fill({ type: 'csp-violation', body: { effectiveDirective: 'img-src' } })))).toHaveLength(20);
  });
});

describe('same-origin guard', () => {
  const h = (values: Record<string, string>) => ({ get: (k: string) => values[k.toLowerCase()] ?? null });
  const url = 'https://pentriq.cloud/api/send-review-request';

  it('allows same-origin browser requests and non-browser clients', () => {
    expect(isSameOriginRequest(h({ origin: 'https://pentriq.cloud', host: 'pentriq.cloud', 'sec-fetch-site': 'same-origin' }), url)).toBe(true);
    expect(isSameOriginRequest(h({ host: 'pentriq.cloud' }), url)).toBe(true);
    expect(isSameOriginRequest(h({ origin: 'https://pentriq.cloud', 'x-forwarded-host': 'pentriq.cloud', host: 'internal:3000' }), url)).toBe(true);
  });

  it('refuses cross-site requests', () => {
    expect(isSameOriginRequest(h({ origin: 'https://evil.example', host: 'pentriq.cloud' }), url)).toBe(false);
    expect(isSameOriginRequest(h({ 'sec-fetch-site': 'cross-site', host: 'pentriq.cloud' }), url)).toBe(false);
    expect(isSameOriginRequest(h({ origin: 'null', host: 'pentriq.cloud' }), url)).toBe(false);
  });
});
