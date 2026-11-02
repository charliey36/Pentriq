import Link from 'next/link';
import { PageFrame } from '@/components/marketing/page-frame';
import { INDUSTRIES } from '@/lib/industries';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Pentriq for your industry',
  description: 'Review requests, rebooking reminders and private feedback for salons, barbers, clinics, vets, garages, trades and more.',
  path: '/for',
});

export default function IndustriesPage() {
  return (
    <PageFrame eyebrow="Industries" title="Built for local service businesses" intro="Pick your trade to see how Pentriq collects reviews and brings customers back for businesses like yours." wide>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INDUSTRIES.map((i) => (
          <li key={i.slug}>
            <Link href={`/for/${i.slug}`} className="card block h-full p-5 transition-shadow hover:shadow-pop">
              <p className="font-semibold text-ink">{i.plural}</p>
              <p className="mt-2 text-sm leading-6 text-ink-3">{i.rebookingIdea}</p>
            </Link>
          </li>
        ))}
      </ul>
    </PageFrame>
  );
}
