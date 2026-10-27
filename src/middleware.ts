import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdminEmail } from '@/lib/admin-access';

/**
 * Refreshes the Supabase auth session cookie on every request and protects
 * all routes except /login, /signup, static assets, and the public API
 * routes (tracking + scheduled send job).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getClaims() verifies the session JWT locally against the project's cached
  // signing keys (and refreshes the session if it has expired), so this no
  // longer costs a network round trip to the Auth server on every request.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password';
  const isPublicApiRoute = pathname.startsWith('/api/track') ||
    pathname.startsWith('/api/integrations') ||
    pathname.startsWith('/integrations/docs') ||
    pathname.startsWith('/api/unsubscribe') ||
    pathname.startsWith('/api/send-review-requests') ||
    pathname.startsWith('/api/send-messages') ||
    pathname.startsWith('/api/scan-customer-lifecycle') ||
    pathname.startsWith('/api/sync-google-reviews') ||
    pathname.startsWith('/api/publish-weekly-digest') ||
    pathname.startsWith('/api/send-weekly-summary') ||
    pathname.startsWith('/api/send-milestones') ||
    pathname.startsWith('/api/test-welcome-email') ||
    pathname.startsWith('/api/stripe/webhook') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/email-assets/') ||
    pathname.startsWith('/auth/callback');
  const isPublicPage = pathname === '/blog' || pathname.startsWith('/blog/') || pathname.startsWith('/feedback/') || pathname.startsWith('/book/') || pathname === '/r' || pathname.startsWith('/r/') || pathname === '/review-unavailable' || pathname === '/tools/review-gap-calculator' || ['/privacy', '/terms', '/cookies', '/about', '/contact', '/pricing', '/changelog', '/roadmap'].includes(pathname);

  if (!user && !isAuthPage && !isPublicApiRoute && !isPublicPage && pathname !== '/') {
    const redirectUrl = new URL('/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Admin Portal: signed-in non-admins get a real 403 (not a redirect or a guessable 404).
  if (user && (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/')) && !isAdminEmail(typeof user.email === 'string' ? user.email : null)) {
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
      : new NextResponse('403 - You do not have permission to view this page.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (user && isAuthPage) {
    const redirectUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
