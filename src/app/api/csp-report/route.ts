import { NextResponse, type NextRequest } from 'next/server';
import { MAX_REPORT_BYTES, parseCspReport } from '@/lib/csp-report';
import { logEvent } from '@/lib/log';
import { requesterId, withinLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Receives Content-Security-Policy violation reports (report-uri and Reporting API formats) and writes each as a
 * structured `security / csp_violation` log line. Public by necessity (browsers send no credentials), so it is
 * size-capped, rate-limited per IP, stores nothing, and always answers 204.
 */
export async function POST(request: NextRequest) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_REPORT_BYTES) return new NextResponse(null, { status: 204 });
  if (!(await withinLimit('csp-report', requesterId(request.headers), { limit: 60, windowSeconds: 60 }))) {
    return new NextResponse(null, { status: 204 });
  }
  const body = await request.text().catch(() => '');
  for (const v of parseCspReport(body)) {
    logEvent('security', 'csp_violation', { ...v }, 'warn');
  }
  return new NextResponse(null, { status: 204 });
}
