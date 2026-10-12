import type { Metadata } from 'next';
import { LegalPage, CONTACT_EMAIL } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that apply when you use Pentriq.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      sections={[
        { heading: 'Service usage', body: ['Pentriq helps businesses request reviews from their customers. You agree to use it lawfully, to only contact customers you are allowed to contact, and not to send spam, misleading requests or content that breaks Google’s review policies.'] },
        { heading: 'Account responsibilities', body: ['You are responsible for your account credentials and for all activity under your account. You must provide accurate information and keep it up to date.'] },
        { heading: 'Subscription terms', body: ['Pentriq is offered as a single monthly subscription, which may begin with a free trial. Subscriptions renew monthly until canceled. You can cancel at any time and keep access until the end of the paid period. Fees already paid are non-refundable except where required by law.'] },
        { heading: 'Limitation of liability', body: ['Pentriq is provided “as is”. We do not guarantee any number of reviews or any business result. To the extent permitted by law, our total liability is limited to the fees you paid in the previous 12 months, and we are not liable for indirect or consequential losses.'] },
        { heading: 'Termination', body: ['We may suspend accounts that breach these terms. You may close your account at any time.'] },
        { heading: 'Contact', body: [`Questions about these terms? Email ${CONTACT_EMAIL}.`] },
      ]}
    />
  );
}
