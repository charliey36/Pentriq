import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { AuthShell } from '@/components/auth-shell';
import { safeNextPath } from '@/lib/safe-redirect';

export const metadata: Metadata = pageMetadata({
  title: 'Create your account',
  description: 'Create a Pentriq account and start a 30-day free trial, no card needed. Automate Google review requests and bring customers back.',
  path: '/signup',
});

export default function SignupPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next ? safeNextPath(searchParams.next) : undefined;
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start sending automated review requests in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Log in
          </Link>
        </>
      }
    >
      <AuthForm mode="signup" next={next} />
    </AuthShell>
  );
}
