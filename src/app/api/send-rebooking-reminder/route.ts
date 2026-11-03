import { NextResponse, type NextRequest } from 'next/server';
import { isSameOriginRequest } from '@/lib/same-origin';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import { sendManualRebookingReminderFor } from '@/lib/manual-sends';

export const dynamic = 'force-dynamic';

/**
 * POST /api/send-rebooking-reminder
 *
 * Owner-triggered manual rebooking reminder. Authenticated via the logged-in
 * session and scoped to the caller's own business (requireBusiness).
 * Delegates to the shared manual-send engine — the same path the
 * customer-detail "Send rebooking reminder" button uses — which inserts a
 * one-off rebooking_reminder message and delivers it immediately, recording
 * the result in message history.
 *
 * Body: { "customerId": "<uuid>" }
 */
export async function POST(request: NextRequest) {
  // Cookie-authenticated and state-changing: refuse cross-site requests (CSRF defence in depth).
  if (!isSameOriginRequest(request.headers, request.url)) {
    return NextResponse.json({ success: false, error: 'Cross-site request refused.' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body must be valid JSON.' }, { status: 400 });
  }

  const customerId = (body as { customerId?: unknown })?.customerId;
  if (typeof customerId !== 'string' || !customerId.trim()) {
    return NextResponse.json({ success: false, error: 'customerId is required.' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const business = await requireBusiness();
  const res = await sendManualRebookingReminderFor(supabase, business.id, customerId.trim());

  if (!res.ok) {
    return NextResponse.json({ success: false, error: res.error ?? 'Send failed.' }, { status: 400 });
  }

  return NextResponse.json({ success: true, messageId: res.messageId });
}
