import { NextResponse, type NextRequest } from 'next/server';
import { resolveBusinessByApiKey } from '@/lib/api-keys';
import { handleServiceCompleted } from '@/lib/service-import';
import { RATE_LIMITS, requesterId, withinLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Request/response shapes: see public/openapi.json and /integrations/docs */
export async function POST(request: NextRequest) {
  if (!(await withinLimit('api-service-completed', requesterId(request.headers), RATE_LIMITS.apiIp))) {
    return NextResponse.json({ success: false, errors: ['Too many requests. Slow down and retry shortly.'] }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const businessId = await resolveBusinessByApiKey(request.headers.get('x-api-key'));
  if (!businessId) {
    return NextResponse.json({ success: false, errors: ['Invalid or missing x-api-key header'] }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, errors: ['Body must be valid JSON'] }, { status: 400 });
  }

  const { status, body: result } = await handleServiceCompleted(businessId, body, 'api');
  return NextResponse.json(result, { status });
}
