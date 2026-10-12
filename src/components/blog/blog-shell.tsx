import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

/** Header + footer frame shared by the blog index and article pages. */
export function BlogShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-clip">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
