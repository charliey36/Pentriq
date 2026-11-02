import Link from 'next/link';
import { LegalLinks } from '@/components/legal-links';
import { getBillingState } from '@/lib/billing';
import { requireAccess } from '@/lib/business';
import { RoleProvider } from '@/components/role-context';
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
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts';
import { NotificationCenter, type NotificationItem } from '@/components/notification-center';
import { triageFeedback } from '@/lib/intelligence/feedback-triage';
import { formatUKDateTime } from '@/lib/uk-defaults';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { business, role } = await requireAccess();
  const supabase = createClient();
  
  const billing = getBillingState(business);

  // Unread private feedback, surfaced as a badge on the sidebar item. A failed
  // count must never break the shell, so errors just fall back to zero.
  // The schema check runs once per server process (not per render) and never
  // blocks or breaks the shell if it fails; it shares the same wait as the count.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [
    { count: newFeedbackCount },
    { count: unreadReviewAlerts },
    ,
    { data: latestFeedback },
    { data: latestAlerts },
    { count: failedThisWeek },
    { count: heldCount },
  ] = await Promise.all([
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
    // Notification centre: the latest few items behind each count.
    supabase
      .from('private_feedback')
      .select('id, rating, comment, created_at, status')
      .eq('business_id', business.id)
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('review_alerts')
      .select('id, title, message, created_at, type')
      .eq('business_id', business.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('status', 'failed')
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('purpose', 'review_request')
      .eq('status', 'queued'),
  ]);

  const now = new Date();
  const notifications: NotificationItem[] = [];
  for (const f of latestFeedback ?? []) {
    const triage = triageFeedback({ rating: f.rating, comment: f.comment, createdAt: f.created_at, status: f.status }, now);
    notifications.push({
      id: `feedback-${f.id}`,
      kind: 'feedback',
      title: `New private feedback${typeof f.rating === 'number' ? ` (${f.rating}★)` : ''}`,
      detail: f.comment.length > 120 ? `${f.comment.slice(0, 117)}…` : f.comment,
      when: formatUKDateTime(new Date(f.created_at)),
      href: '/feedback-inbox?view=open',
      urgent: triage.urgency === 'critical',
    });
  }
  for (const a of latestAlerts ?? []) {
    notifications.push({
      id: `alert-${a.id}`,
      kind: 'alert',
      title: a.title,
      detail: a.message,
      when: formatUKDateTime(new Date(a.created_at)),
      href: '/reviews?tab=alerts',
      urgent: a.type === 'new_one_star',
    });
  }
  if ((failedThisWeek ?? 0) > 0) {
    notifications.push({
      id: 'failed-week',
      kind: 'failed',
      title: `${failedThisWeek} message${failedThisWeek === 1 ? '' : 's'} failed this week`,
      detail: 'Usually a mistyped address. Fix it and resend.',
      href: '/activity?type=message',
    });
  }
  if ((heldCount ?? 0) > 0) {
    notifications.push({
      id: 'held',
      kind: 'held',
      title: `${heldCount} review request${heldCount === 1 ? '' : 's'} on hold`,
      detail: 'Waiting for you to send them.',
      href: '/customers?status=held',
    });
  }
  const attentionTotal = (newFeedbackCount ?? 0) + (unreadReviewAlerts ?? 0) + ((failedThisWeek ?? 0) > 0 ? 1 : 0) + ((heldCount ?? 0) > 0 ? 1 : 0);

  return (
    <RoleProvider role={role}>
    <SidebarProvider>
      <ToastProvider>
        <CommandPaletteProvider>
          <KeyboardShortcuts />
          <div className="min-h-screen">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg focus:ring-2 focus:ring-brand-500"
            >
              Skip to main content
            </a>
            <SidebarDrawer
              businessName={business.name ?? ''}
              businessLogoUrl={business.brand_logo_url}
              feedbackCount={newFeedbackCount ?? 0}
              reviewAlertCount={unreadReviewAlerts ?? 0}
            />

            <AppContentShell>
              <header className="glass sticky top-0 z-20 flex h-16 print:hidden flex-shrink-0 items-center gap-2 border-b border-line/80 px-4 sm:px-6 lg:px-8">
                <SidebarToggleButton />
                <HeaderBrand />
                <HeaderTitle />

                <div className="ml-auto flex items-center gap-1">
                  <HeaderSearchButton />
                  <NotificationCenter items={notifications} total={attentionTotal} unreadAlerts={unreadReviewAlerts ?? 0} />
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

              <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
                {billing.status !== 'active' && (
                  <Link href={billing.status === 'trial_available' ? '/onboarding' : '/settings/billing'} className="mb-6 block rounded-xl bg-brand-50 px-4 py-2.5 print:hidden text-sm text-brand-800 ring-1 ring-brand-600/15 dark:bg-brand-500/10 dark:text-brand-200">
                    {billing.status === 'trial_available'
                      ? 'Send your first review request to start your 30-day free trial — no card needed'
                      : billing.status === 'trialing'
                        ? `${billing.trialDaysLeft} days left in your free trial — subscribe`
                        : 'Subscription needed to keep sending — view billing'}
                  </Link>
                )}
                {children}
              </main>
              <footer className="mx-auto flex w-full max-w-6xl justify-end px-4 pb-6 sm:px-6 lg:px-8 print:hidden">
                <LegalLinks />
              </footer>
            </AppContentShell>
          </div>
        </CommandPaletteProvider>
      </ToastProvider>
    </SidebarProvider>
    </RoleProvider>
  );
}
