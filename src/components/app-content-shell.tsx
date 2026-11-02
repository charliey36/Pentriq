'use client';

import type { ReactNode } from 'react';
import { useSidebar } from '@/components/sidebar-context';

/**
 * Wraps the header + main content column so its left margin reacts to the
 * sidebar on desktop (lg+). On small screens the sidebar is an overlay, so
 * no margin shift happens regardless of state.
 */
export function AppContentShell({ children }: { children: ReactNode }) {
  const { isOpen, ready } = useSidebar();

  return (
    <div
      className={`flex min-h-screen flex-1 flex-col ${
        ready ? 'transition-[margin] duration-300 ease-out-expo' : ''
      } ${isOpen ? 'lg:ml-[264px]' : 'lg:ml-0'} print:ml-0`}
    >
      {children}
    </div>
  );
}
