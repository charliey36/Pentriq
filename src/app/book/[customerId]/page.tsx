import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { PublicShell } from '@/components/public-shell';
import { Notice } from '@/components/ui/notice';
import { RequestRebookingForm } from './request-rebooking-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Book your next visit' };

export default async function BookPage({ params: paramsPromise }: { params: Promise<{ customerId: string }> }) {
  const params = await paramsPromise;
  const supabase = createAdminClient();

  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_id')
    .eq('id', params.customerId)
    .maybeSingle();

  let businessName: string | undefined;
  let logoUrl: string | null = null;
  if (customer) {
    const { data: business } = await supabase
      .from('businesses')
      .select('name, brand_logo_url')
      .eq('id', customer.business_id)
      .maybeSingle();
    if (business) {
      businessName = business.name || undefined;
      logoUrl = business.brand_logo_url;
    }
  }

  return (
    <PublicShell
      businessName={businessName}
      logoUrl={logoUrl}
      title={`Book your next visit${businessName ? ` with ${businessName}` : ''}`}
      subtitle="Let us know when works for you and we'll confirm your appointment."
      note="Sent directly to the business"
    >
      {customer ? (
        <RequestRebookingForm customerId={params.customerId} />
      ) : (
        <Notice variant="warning">This booking link is no longer valid.</Notice>
      )}
    </PublicShell>
  );
}
