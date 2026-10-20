import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { SettingsTabs } from '@/components/settings-tabs';
import { LoyaltyActiveToggle, LoyaltyProgramForm } from './loyalty-program-form';
import { ReferralPromotions } from './referral-promotions';

export const metadata: Metadata = { title: 'Loyalty program' };

export default async function LoyaltySettingsPage() {
  const business = await requireBusiness();
  const supabase = createClient();

  const { data: program } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('business_id', business.id)
    .maybeSingle();

  const { data: promotions } = await supabase
    .from('referral_promotions')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  return (
    <div>
      <PageHeader
        title="Loyalty program"
        icon="gift"
        tone="rose"
        description="Reward repeat visits, reviews and referrals with points customers can redeem. Points are tracked on an append-only ledger per customer, visible on each customer's detail page."
        actions={<LoyaltyActiveToggle program={program ?? null} />}
        tabs={<SettingsTabs />}
      />

      <LoyaltyProgramForm program={program ?? null}>
        <ReferralPromotions promotions={promotions ?? []} />
      </LoyaltyProgramForm>
    </div>
  );
}
