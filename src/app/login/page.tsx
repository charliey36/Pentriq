import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { Notice } from '@/components/ui/notice';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = pageMetadata({
  title: 'Log in',
  description: 'Log in to Pentriq to manage review requests, rebooking reminders and customer feedback.',
  path: '/login',
});

export default function LoginPage({ searchParams }: { searchParams: { reset?: string } }) {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to keep review requests flowing."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Sign up
          </Link>
        </>
      }
    >
      {searchParams.reset && <div className="mb-5"><Notice variant="success">Password updated. Log in with your new password.</Notice></div>}
      <AuthForm mode="login" />
    </AuthShell>
  );
}
