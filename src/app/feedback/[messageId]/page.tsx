import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { PublicShell } from '@/components/public-shell';
import { Notice } from '@/components/ui/notice';
import { PrivateFeedbackForm } from './private-feedback-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Share feedback' };

/**
 * Public landing page for the private feedback link included in every
 * review request message, alongside (never instead of) the public review
 * link - see src/lib/compliance.ts for why this page exists unconditionally
 * rather than being gated behind a sentiment check.
 */
export default async function FeedbackPage({ params: paramsPromise }: { params: Promise<{ messageId: string }> }) {
  const params = await paramsPromise;
  const supabase = createAdminClient();

  const { data: message } = await supabase
    .from('messages')
    .select('id, business_id')
    .eq('id', params.messageId)
    .maybeSingle();

  let businessName: string | undefined;
  let logoUrl: string | null = null;
  if (message) {
    const { data: business } = await supabase
      .from('businesses')
      .select('name, brand_logo_url')
      .eq('id', message.business_id)
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
      title={`Share feedback${businessName ? ` with ${businessName}` : ''}`}
      subtitle="This goes directly and privately to the business — it's not posted publicly."
      note="Private: only the business sees this"
    >
      {message ? (
        <PrivateFeedbackForm messageId={params.messageId} />
      ) : (
        <Notice variant="warning">This feedback link is no longer valid.</Notice>
      )}
    </PublicShell>
  );
}
