'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/components/sidebar-context';
import { Logo } from '@/components/logo';
import { SidebarNav } from '@/components/sidebar-nav';
import { SidebarSearch } from '@/components/search-triggers';
import { WorkspaceMenu } from '@/components/workspace-menu';
import { Icon } from '@/components/ui/icons';

/**
 * The single sidebar for desktop and mobile. It is fixed at every
 * breakpoint and slides via `translate-x`; on large screens the content
 * column shifts to make room (see AppContentShell), on small screens it
 * overlays with a backdrop.
 *
 * It is frosted glass: the page's ambient color shows through, blurred.
 *
 * Before hydration (`ready` false) it renders closed on mobile and open on
 * desktop, so phones never see the overlay flash open on first paint.
 */
export function SidebarDrawer({
  businessName,
  businessLogoUrl,
  feedbackCount,
  reviewAlertCount = 0,
}: {
  businessName: string;
  businessLogoUrl: string | null;
  feedbackCount: number;
  reviewAlertCount?: number;
}) {
  const { isOpen, ready, close } = useSidebar();
  const pathname = usePathname();

  // On mobile the sidebar is an overlay, so close it after navigating.
  useEffect(() => {
    if (window.innerWidth < 1024) {
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape closes the overlay on mobile.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && window.innerWidth < 1024) close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  const position = !ready
    ? '-translate-x-full invisible lg:translate-x-0 lg:visible'
    : isOpen
      ? 'translate-x-0 visible'
      : '-translate-x-full invisible';

  const displayName = businessName.trim() || 'Your business';

  return (
    <>
      {/* Backdrop - mobile only; on desktop the sidebar pushes content aside. */}
      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-ink/45 backdrop-blur-[3px] transition-opacity duration-200 lg:hidden ${
          ready && isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-line/80 bg-surface-sidebar/80 backdrop-blur-xl backdrop-saturate-150 ${position} ${
          ready ? 'transition-[transform,visibility] duration-300 ease-out-expo' : ''
        } max-lg:shadow-pop`}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between px-4">
          <Link href="/dashboard" aria-label="Pentriq dashboard" className="rounded-lg">
            <Logo />
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Close navigation menu"
            className="btn btn-ghost btn-icon -mr-2 h-8 w-8 lg:hidden"
          >
            <Icon name="x" className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="space-y-2.5 px-3 pb-1">
          <WorkspaceMenu name={displayName} logoUrl={businessLogoUrl} />
          <SidebarSearch />
        </div>

        <SidebarNav feedbackCount={feedbackCount} reviewAlertCount={reviewAlertCount} />
      </aside>
    </>
  );
}
