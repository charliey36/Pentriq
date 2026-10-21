import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';

/**
 * Handles the redirect from Supabase Auth email links (signup confirmation,
 * magic link, password reset). Supabase sends the visitor here with a `code`
 * query param; exchanging it for a session sets the auth cookies, then we
 * send them on to the dashboard.
 *
 * This route must be registered as the "Site URL" / redirect target in
 * Supabase (Authentication -> URL Configuration), or passed explicitly via
 * emailRedirectTo when calling supabase.auth.signUp(), for the confirmation
 * link to land here instead of a bare page with no session.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }

    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL('/login', request.url));
}
