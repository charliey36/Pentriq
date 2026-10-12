import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { ForgotPasswordForm } from '@/components/password-reset-forms';

export const metadata: Metadata = { title: 'Forgot password', robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={<Link href="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-400">Back to log in</Link>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
