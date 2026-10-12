import type { Metadata } from 'next';

// Internal test page: keep out of search results.
export const metadata: Metadata = { title: 'AI test', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
