/**
 * Content-Security-Policy violation reports.
 *
 * Browsers POST these when the report-only policy (next.config.mjs) would have blocked something. Collecting
 * them is what makes it safe to switch the policy to enforcing: a week of production traffic with no reports
 * from Stripe, Sentry, Supabase or Google flows means enforcing will not break them.
 *
 * Two wire formats exist: the legacy `report-uri` body ({"csp-report": {...}}, kebab-case) and the Reporting
 * API (`report-to`), an array of {type: "csp-violation", body: {...}} with camelCase keys. Both are reduced to
 * one small, privacy-safe shape: URLs keep only origin + path (no query strings, which can hold tokens).
 */

export type CspViolation = {
  directive: string;
  blocked: string;
  document: string;
  source: string | null;
  line: number | null;
  disposition: 'report' | 'enforce' | null;
};

export const MAX_REPORT_BYTES = 16 * 1024;

function stripUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  // Keywords such as "inline", "eval", "data" are not URLs.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value.slice(0, 40);
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return value.slice(0, 40);
  }
}

function fromLegacy(r: Record<string, unknown>): CspViolation {
  return {
    directive: String(r['effective-directive'] ?? r['violated-directive'] ?? '').split(' ')[0].slice(0, 60),
    blocked: stripUrl(r['blocked-uri']),
    document: stripUrl(r['document-uri']),
    source: stripUrl(r['source-file']) || null,
    line: typeof r['line-number'] === 'number' ? r['line-number'] : null,
    disposition: r.disposition === 'enforce' || r.disposition === 'report' ? r.disposition : null,
  };
}

function fromReportingApi(b: Record<string, unknown>): CspViolation {
  return {
    directive: String(b.effectiveDirective ?? '').slice(0, 60),
    blocked: stripUrl(b.blockedURL),
    document: stripUrl(b.documentURL),
    source: stripUrl(b.sourceFile) || null,
    line: typeof b.lineNumber === 'number' ? b.lineNumber : null,
    disposition: b.disposition === 'enforce' || b.disposition === 'report' ? b.disposition : null,
  };
}

/** Parses either report format; returns at most 20 violations, never throws. */
export function parseCspReport(body: string): CspViolation[] {
  if (!body || body.length > MAX_REPORT_BYTES) return [];
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  const out: CspViolation[] = [];
  if (Array.isArray(json)) {
    for (const item of json.slice(0, 20)) {
      if (item && typeof item === 'object' && (item as { type?: unknown }).type === 'csp-violation') {
        const b = (item as { body?: unknown }).body;
        if (b && typeof b === 'object') out.push(fromReportingApi(b as Record<string, unknown>));
      }
    }
  } else if (json && typeof json === 'object' && 'csp-report' in json) {
    const r = (json as Record<string, unknown>)['csp-report'];
    if (r && typeof r === 'object') out.push(fromLegacy(r as Record<string, unknown>));
  }
  return out.filter((v) => v.directive);
}
