import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { sendNotificationEmail } from '@/lib/email';
import { renderWelcomeEmail } from '@/lib/email-templates/welcome';

export const dynamic = 'force-dynamic';

const SAMPLE_BUSINESS = 'Bright Smile Dental';

/**
 * Welcome-email preview + test send. Protected by CRON_SECRET.
 *   GET ?preview=1  -> returns the rendered HTML (sample business data), sends nothing
 *   GET             -> also sends it to WELCOME_TEST_EMAIL (never to customers)
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set.' }, { status: 500 });
  if (!isCronAuthorized(request, secret)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  if (request.nextUrl.searchParams.get('preview')) {
    const { html } = renderWelcomeEmail({ businessName: SAMPLE_BUSINESS });
    return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const to = process.env.WELCOME_TEST_EMAIL?.trim();
  if (!to) return NextResponse.json({ error: 'WELCOME_TEST_EMAIL is not set.' }, { status: 400 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY is not set; nothing was sent.' }, { status: 400 });

  try {
    await sendNotificationEmail(to, 'welcome', SAMPLE_BUSINESS);
    console.log(`[test-welcome-email] SUCCESS sent to ${to}`);
    return NextResponse.json({ sent: true, to });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[test-welcome-email] FAILED to ${to}: ${message}`);
    return NextResponse.json({ sent: false, to, error: message }, { status: 502 });
  }
}
