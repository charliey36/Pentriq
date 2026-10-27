import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RATE_LIMITS, requesterId, withinLimit } from '@/lib/rate-limit';
import { unsubscribeCustomer } from '@/lib/unsubscribe';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = 'force-dynamic';

/**
 * Public unsubscribe endpoint linked from every review request email
 * (CAN-SPAM requires a working opt-out mechanism in commercial email).
 *
 * GET /api/unsubscribe/[customerId] marks the customer as unsubscribed and
 * cancels any still-pending review request for them, then shows a plain
 * confirmation page. Runs with the admin client since the visitor clicking
 * this link has no Supabase auth session — same pattern as the existing
 * click-tracking redirect.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { customerId: string } }
) {
  const { customerId } = params;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const html = (message: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribed</title>
</head>
<body style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; color: #0f172a; text-align: center;">
  <p style="font-size: 16px; line-height: 1.5;">${message}</p>
</body>
</html>`;

  if (!uuidPattern.test(customerId)) {
    return new NextResponse(html('Invalid unsubscribe link.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!(await withinLimit('unsubscribe-ip', requesterId(request.headers), RATE_LIMITS.unsubscribeIp))) {
    return new NextResponse(html('Too many requests. Please wait a few minutes and try again.'), {
      status: 429,
      headers: { 'Content-Type': 'text/html', 'Retry-After': '600' },
    });
  }

  const supabase = createAdminClient();

  const outcome = await unsubscribeCustomer(supabase, customerId);
  if (outcome === 'not_found') {
    return new NextResponse(html('We could not find that subscription.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  return new NextResponse(
    html("You've been unsubscribed and won't receive any further emails from this business."),
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

/**
 * RFC 8058 one-click unsubscribe. Mail clients that see
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` POST here directly, with
 * no page shown. Same effect as the link in the email footer.
 */
export async function POST(request: NextRequest, { params }: { params: { customerId: string } }) {
  const { customerId } = params;
  if (!UUID.test(customerId)) return new NextResponse('Invalid unsubscribe link.', { status: 400 });
  if (!(await withinLimit('unsubscribe-ip', requesterId(request.headers), RATE_LIMITS.unsubscribeIp))) {
    return new NextResponse('Too many requests.', { status: 429, headers: { 'Retry-After': '600' } });
  }
  const outcome = await unsubscribeCustomer(createAdminClient(), customerId);
  return new NextResponse(outcome === 'not_found' ? 'Not found.' : 'Unsubscribed.', { status: outcome === 'not_found' ? 404 : 200 });
}
