import Link from 'next/link';
import { LegalLinks } from '@/components/legal-links';
import { getBillingState } from '@/lib/billing';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { ensureSchemaValidated } from '@/lib/schema-validation';
import { logout } from '@/app/(app)/actions';
import { SidebarProvider } from '@/components/sidebar-context';
import { SidebarDrawer } from '@/components/sidebar-drawer';
import { SidebarToggleButton } from '@/components/sidebar-toggle-button';
import { ThemeToggleButton } from '@/components/theme-toggle-button';
import { AppContentShell } from '@/components/app-content-shell';
import { HeaderBrand } from '@/components/header-brand';
import { HeaderTitle } from '@/components/header-title';
import { HeaderSearchButton } from '@/components/search-triggers';
import { CommandPaletteProvider } from '@/components/command-palette';
import { ToastProvider } from '@/components/toast';
import { Icon } from '@/components/ui/icons';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const business = await requireBusiness();
  const supabase = createClient();
  
  const billing = getBillingState(business);

  // Unread private feedback, surfaced as a badge on the sidebar item. A failed
  // count must never break the shell, so errors just fall back to zero.
  // The schema check runs once per server process (not per render) and never
  // blocks or breaks the shell if it fails; it shares the same wait as the count.
  const [{ count: newFeedbackCount }, { count: unreadReviewAlerts }] = await Promise.all([
    supabase
      .from('private_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('status', 'new'),
    // Unread Google review alerts (0 if the table doesn't exist yet).
    supabase
      .from('review_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('is_read', false),
    ensureSchemaValidated(supabase).catch((e) => {
      console.error('[Schema Validation] Error during validation:', e);
    }),
  ]);

  return (
    <SidebarProvider>
      <ToastProvider>
        <CommandPaletteProvider>
          <div className="min-h-screen">
            <SidebarDrawer
              businessName={business.name ?? ''}
              businessLogoUrl={business.brand_logo_url}
              feedbackCount={newFeedbackCount ?? 0}
              reviewAlertCount={unreadReviewAlerts ?? 0}
            />

            <AppContentShell>
              <header className="glass sticky top-0 z-20 flex h-16 flex-shrink-0 items-center gap-2 border-b border-line/80 px-4 sm:px-6 lg:px-8">
                <SidebarToggleButton />
                <HeaderBrand />
                <HeaderTitle />

                <div className="ml-auto flex items-center gap-1">
                  <HeaderSearchButton />
                  <ThemeToggleButton />
                  <span aria-hidden="true" className="mx-1.5 hidden h-5 w-px bg-line-strong sm:block" />
                  <form action={logout}>
                    <button type="submit" className="btn btn-ghost btn-sm" aria-label="Log out">
                      <Icon name="logout" className="h-4 w-4" />
                      <span className="hidden sm:inline">Log out</span>
                    </button>
                  </form>
                </div>
              </header>

              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
                {billing.status !== 'active' && (
                  <Link href="/settings/billing" className="mb-6 block rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-800 ring-1 ring-brand-600/15 dark:bg-brand-500/10 dark:text-brand-200">
                    {billing.status === 'trial_available'
                      ? 'Start your 30-day free trial to begin sending — no card needed'
                      : billing.status === 'trialing'
                        ? `${billing.trialDaysLeft} days left in your free trial — subscribe`
                        : 'Subscription needed to keep sending — view billing'}
                  </Link>
                )}
                {children}
              </main>
              <footer className="mx-auto flex w-full max-w-6xl justify-end px-4 pb-6 sm:px-6 lg:px-8">
                <LegalLinks />
              </footer>
            </AppContentShell>
          </div>
        </CommandPaletteProvider>
      </ToastProvider>
    </SidebarProvider>
  );
}
