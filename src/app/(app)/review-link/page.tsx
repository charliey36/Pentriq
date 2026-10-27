import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { isSafeHttpUrl } from '@/lib/email-templates/review-destinations';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { QrPanel } from './qr-panel';

export const metadata: Metadata = { title: 'Review link & QR code' };

export default async function ReviewLinkPage() {
  const business = await requireBusiness();
  const url = business.google_review_url?.trim() ?? '';
  const valid = isSafeHttpUrl(url);

  return (
    <div>
      <PageHeader
        title="Review link & QR code"
        icon="star"
        tone="emerald"
        description="Get reviews from walk-in customers too. Print this QR code on your desk, invoices, receipts, business cards or vehicle."
      />
      <SectionCard>
        {valid ? (
          <QrPanel url={url} businessName={business.name === 'My Business' ? 'Leave us a review' : business.name} logoUrl={business.brand_logo_url} />
        ) : (
          <EmptyState
            icon="star"
            title="Add your review link first"
            description="Your QR code is made from your Google review link. Add it in Settings and it will appear here."
            action={<Link href="/settings" className="btn btn-primary">Open settings</Link>}
          />
        )}
      </SectionCard>
    </div>
  );
}
