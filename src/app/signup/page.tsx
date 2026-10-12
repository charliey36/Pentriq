import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = pageMetadata({
  title: 'Create your account',
  description: 'Create a Pentriq account, then start your 14-day free trial when you are ready. Automate review requests and bring customers back.',
  path: '/signup',
});

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start sending automated review requests in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Log in
          </Link>
        </>
      }
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
