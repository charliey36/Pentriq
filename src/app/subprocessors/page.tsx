import Link from 'next/link';
import { PageFrame } from '@/components/marketing/page-frame';
import { JsonLd } from '@/components/json-ld';
import { breadcrumbLd, pageMetadata } from '@/lib/seo';
import { ORG, SITE_URL } from '@/lib/site';
import { SUBPROCESSORS, WHEN_LABEL } from '@/lib/subprocessors';

export const metadata = pageMetadata({
  title: 'Sub-processors',
  description: 'The third-party providers Pentriq uses to deliver its service, what each one does and when it is involved.',
  path: '/subprocessors',
});

export default function SubprocessorsPage() {
  return (
    <PageFrame
      eyebrow="Trust"
      title="Sub-processors"
      intro="The companies we use to run Pentriq, what each one handles, and when it is involved. Some are only used if your business turns a feature on or connects an account."
      wide
    >
      <JsonLd data={breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: 'Sub-processors', url: `${SITE_URL}/subprocessors` }])} />
      <div className="card overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">Pentriq sub-processors</caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">What it does</th>
                <th scope="col">Personal data involved</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name}>
                  <td className="whitespace-nowrap font-medium text-ink">
                    <a href={s.url} rel="noopener noreferrer" target="_blank" className="hover:underline">
                      {s.name}
                    </a>
                  </td>
                  <td>{s.purpose}</td>
                  <td className="text-ink-3">{s.data}</td>
                  <td className="whitespace-nowrap text-ink-3">{WHEN_LABEL[s.when]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-8 space-y-3 text-[15px] leading-7 text-ink-2">
        <p>
          Where personal data leaves the UK, we rely on the providers’ data protection agreements and the transfer safeguards they offer. For the
          current processing locations, or to be told about changes to this list, email{' '}
          <a href={`mailto:${ORG.email}?subject=Sub-processors`} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">{ORG.email}</a>.
        </p>
        <p>
          See also our <Link href="/privacy" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">privacy policy</Link> and{' '}
          <Link href="/security" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">security overview</Link>.
        </p>
      </div>
    </PageFrame>
  );
}
