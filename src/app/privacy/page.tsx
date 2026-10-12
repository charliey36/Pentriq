import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import { LegalPage, CONTACT_EMAIL } from '@/components/legal-page';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy',
  description: 'How Pentriq collects, uses and protects your data, including customer information you upload.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      sections={[
        { heading: 'Data we collect', body: ['When you create an account we collect your email address, business name and Google review link. We also record how you use Pentriq (for example emails sent and link clicks) to run the service.'] },
        { heading: 'Customer information', body: ['You upload your own customers’ names, email addresses and phone numbers. You are the controller of that data and we process it on your behalf solely to send review requests and show you results. Every email includes an unsubscribe link, and unsubscribed customers are never contacted again. You must have a lawful basis to contact the customers you add.'] },
        { heading: 'Cookies', body: ['We use essential cookies to keep you signed in. See our Cookie Policy for details.'] },
        { heading: 'Sharing and retention', body: ['We do not sell your data. We use trusted providers to run Pentriq (hosting, database, email delivery and, when enabled, payments). We keep your data while your account is active and delete it when your account is removed.'] },
        { heading: 'Your rights', body: ['You can ask us to access, correct or delete your data at any time. You can also do it yourself: Settings → Data & privacy lets you download a copy of everything we hold for your business and permanently delete your account and all of its data. Deleting your account cancels any active subscription; payment records are kept by our payment provider for the period required by law.'] },
        { heading: 'Contact', body: [`Questions about privacy? Email ${CONTACT_EMAIL}.`] },
      ]}
    />
  );
}
