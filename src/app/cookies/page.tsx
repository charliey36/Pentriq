import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import { LegalPage, CONTACT_EMAIL } from '@/components/legal-page';

export const metadata: Metadata = pageMetadata({
  title: 'Cookie Policy',
  description: 'How Pentriq uses essential cookies and similar technologies to keep you signed in.',
  path: '/cookies',
});

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      sections={[
        { heading: 'Essential cookies', body: ['We use essential cookies to sign you in and keep your session secure, and to remember preferences such as light or dark mode. The service cannot work without them.'] },
        { heading: 'Analytics cookies', body: ['We do not currently use analytics cookies. If we add them, we will list them here and ask for your consent first.'] },
        { heading: 'Managing cookies', body: ['You can block or delete cookies in your browser settings, but you will not be able to stay signed in.'] },
        { heading: 'Contact', body: [`Questions? Email ${CONTACT_EMAIL}.`] },
      ]}
    />
  );
}
