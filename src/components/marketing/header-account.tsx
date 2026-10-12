'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { navGroups } from '@/components/sidebar-nav';

/**
 * Public pages (blog, roadmap, changelog, pricing…) are static and cached, so they cannot know
 * who is signed in on the server. Instead the browser checks for a session after load, and a
 * signed-in visitor gets their app navigation instead of "Log in / Get started". Reading the
 * session is local (cookie), so there is no network round trip. Visitors who are not signed in
 * see exactly what they always did.
 */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    // No sign-in cookie → nothing to look up, and anonymous visitors never download the auth library.
    if (!/(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie)) return;
    let unsubscribe = () => {};
    let cancelled = false;
    import('@/lib/supabase/client').then(({ createClient }) => {
      if (cancelled) return;
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }) => !cancelled && setSignedIn(Boolean(data.session)));
      const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return signedIn;
}

const linkClass = 'block rounded-lg px-3 py-2 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-muted/70 hover:text-ink';

/** Desktop header actions: "Log in / Get started" for visitors, "App menu / Dashboard" when signed in. */
export function HeaderAccount() {
  const signedIn = useSignedIn();

  if (!signedIn) {
    return (
      <>
        <Link href="/login" className="btn btn-ghost btn-sm hidden sm:inline-flex">
          Log in
        </Link>
        <Link href="/signup" className="btn btn-primary btn-sm">
          Get started
        </Link>
      </>
    );
  }

  return (
    <>
      <details className="group relative hidden md:block">
        <summary className="btn btn-ghost btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          App menu <span aria-hidden="true">▾</span>
        </summary>
        <nav aria-label="App" className="absolute right-0 top-full mt-2 max-h-[70vh] w-60 overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-pop">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-1 last:mb-0">
              <p className="eyebrow px-3 pb-1 pt-2 text-ink-4">{group.label}</p>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </details>
      <Link href="/dashboard" className="btn btn-primary btn-sm">
        Dashboard
      </Link>
    </>
  );
}

/** Mobile menu tail: "Log in" for visitors, the full app navigation when signed in. */
export function MobileAccountLinks() {
  const signedIn = useSignedIn();

  if (!signedIn) {
    return (
      <Link href="/login" className={linkClass}>
        Log in
      </Link>
    );
  }

  return (
    <>
      <Link href="/dashboard" className={`${linkClass} bg-surface-muted/70 text-ink`}>
        Dashboard
      </Link>
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="eyebrow px-3 pb-1 pt-3 text-ink-4">{group.label}</p>
          {group.items.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
