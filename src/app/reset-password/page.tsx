import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { ResetPasswordForm } from '@/components/password-reset-forms';

export const metadata: Metadata = { title: 'Set new password', robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a new password for your account."
      footer={<Link href="/forgot-password" className="font-medium text-brand-700 hover:underline dark:text-brand-400">Link expired? Request a new one</Link>}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
