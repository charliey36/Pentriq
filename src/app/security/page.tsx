import Link from 'next/link';
import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { ORG, SITE_URL } from '@/lib/site';
import { Icon, type IconName } from '@/components/ui/icons';

export const metadata = pageMetadata({
  title: 'Security',
  description: 'How Pentriq protects your business and customer data: tenant isolation, two-factor authentication, encryption, audit logging, data rights and responsible disclosure.',
  path: '/security',
});

/**
 * Public trust page for buyers and their IT or security reviewers. Every statement describes a control that
 * exists in the product today; certifications Pentriq does not hold are stated plainly rather than implied.
 */
const sections: Array<{ icon: IconName; title: string; points: string[] }> = [
  {
    icon: 'shield',
    title: 'Your data stays yours',
    points: [
      'Every business’s data is isolated at the database layer with row-level security on every table. Automated tests check isolation between businesses and between roles on every change.',
      'Roles (owner, admin, staff) limit who can change settings, billing, integrations and data exports. Configuration is protected in the database as well as the app.',
      'Staff never see API keys, webhook secrets, team invitations or the audit log.',
    ],
  },
  {
    icon: 'lock',
    title: 'Sign-in protection',
    points: [
      'Two-factor authentication with any authenticator app, which an owner can require for the whole team. An admin can reset a lost device.',
      'One password policy everywhere (at least 8 characters, common passwords refused) and one-click "sign out of every other device".',
      'Two-factor status is read from signed tokens, never from data in the browser.',
      'Pentriq staff can only open the operator console with two-factor, every time they sign in.',
    ],
  },
  {
    icon: 'eyeOff',
    title: 'Encryption and secrets',
    points: [
      'All traffic uses HTTPS with HSTS. Data is stored with our database provider, which encrypts it at rest.',
      'Connection tokens for Google and booking systems, and webhook signing secrets, are additionally encrypted with AES-256-GCM before they are stored.',
      'API keys and team invitation links are stored only as SHA-256 hashes. IP addresses in the audit log are hashed.',
    ],
  },
  {
    icon: 'activity',
    title: 'Audit trail',
    points: [
      'Security-relevant actions are recorded: team and role changes, two-factor changes, data exports and erasures, API key and webhook changes, integration connections and settings changes.',
      'Owners and admins can filter the audit log and export it as CSV.',
    ],
  },
  {
    icon: 'document',
    title: 'Data protection and GDPR',
    points: [
      'Export everything for your business, or everything about one customer, in a few clicks. Erase a customer permanently when they ask.',
      'Choose a retention period for message history and tracking data; older records are deleted automatically each night.',
      'Every email has a one-click unsubscribe, and unsubscribed customers stay on a do-not-contact list.',
      'Review requests always offer both a public review and private feedback to every customer. Pentriq never filters reviews by sentiment (in line with Google’s policy and the FTC rule on review gating).',
    ],
  },
  {
    icon: 'bolt',
    title: 'Application security',
    points: [
      'Security headers on every page, including a Content Security Policy and framing protection.',
      'Rate limits on public endpoints, cross-site request checks, and protection against server-side request forgery on outbound webhooks. Webhooks are signed with HMAC-SHA256.',
      'Dependencies are checked for known vulnerabilities on every change; production builds must have no high or critical advisories.',
    ],
  },
];

export default function SecurityPage() {
  return (
    <PageFrame
      eyebrow="Trust"
      title="Security at Pentriq"
      intro="You trust us with your customers’ details. Here is exactly how we protect them, written for business owners and the IT people who check on their behalf."
    >
      <JsonLd data={breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'Security', url: `${SITE_URL}/security` }])} />
      <div className="space-y-10">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-[-0.02em] text-ink">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-700 dark:text-brand-300">
                <Icon name={s.icon} className="h-4 w-4" />
              </span>
              {s.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {s.points.map((p) => (
                <li key={p} className="flex gap-3 text-[16px] leading-7 text-ink-2">
                  <Icon name="check" className="mt-1.5 h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400" strokeWidth={2.2} />
                  {p}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl border border-line bg-surface-subtle/60 p-6">
          <h2 className="text-lg font-semibold text-ink">What we don’t claim</h2>
          <p className="mt-2 text-[15px] leading-7 text-ink-2">
            Pentriq does not currently hold SOC 2 or ISO 27001 certification, and does not offer single sign-on (SAML). If your organisation needs a
            security questionnaire completed or a data processing agreement, email us and we will help.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">Sub-processors</h2>
          <p className="mt-2 text-[15px] leading-7 text-ink-2">
            The providers we use to run Pentriq, what each one does and when it is involved are listed on our{' '}
            <Link href="/subprocessors" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">sub-processors page</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">Report a vulnerability</h2>
          <p className="mt-2 text-[15px] leading-7 text-ink-2">
            Found a security issue? Email <a href={`mailto:${ORG.email}?subject=Security%20report`} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">{ORG.email}</a> with
            the details and steps to reproduce. Please give us reasonable time to fix it before disclosing, and do not access other people’s data. Our{' '}
            <a href="/.well-known/security.txt" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">security.txt</a> has the same details.
          </p>
        </section>
      </div>
    </PageFrame>
  );
}
