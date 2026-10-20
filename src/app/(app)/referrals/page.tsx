import Link from 'next/link';
import type { Metadata } from 'next';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CopyButton } from '@/components/ui/copy-button';
import { CreateReferralForm } from './create-referral-form';
import { ValidateReferralForm } from './validate-referral-form';
import { DeleteReferralButton } from './delete-referral-button';

export const metadata: Metadata = { title: 'Referrals' };

export default async function ReferralsPage({ searchParams }: { searchParams?: { status?: string } }) {
  const business = await requireBusiness();
  const supabase = createClient();

  const requestedStatus = searchParams?.status;
  const statusFilter = ['active', 'redeemed', 'expired'].includes(requestedStatus ?? '') ? (requestedStatus as 'active' | 'redeemed' | 'expired') : null;
  const referralQuery = supabase.from('referrals').select('*').eq('business_id', business.id);
  if (statusFilter) referralQuery.eq('status', statusFilter);
  const [{ data: customers }, { data: referrals }, { data: promotions }] = await Promise.all([
    supabase.from('customers').select('*').eq('business_id', business.id).order('name'),
    referralQuery.order('created_at', { ascending: false }),
    supabase.from('referral_promotions').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
  ]);

  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  return (
    <div>
      <PageHeader
        title="Referrals"
        icon="userPlus"
        tone="amber"
        description="Generate a referral code for an existing customer, then redeem it when a new customer they referred comes in. Both get rewarded with loyalty points (if your loyalty program is active) once the referral is marked complete."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Generate a referral code" description="Give an existing customer a code to share." action={<Link href="/settings/loyalty" className="btn btn-secondary btn-sm">Loyalty Program Settings</Link>}>
          <CreateReferralForm customers={customers ?? []} promotions={promotions ?? []} />
        </SectionCard>

        <SectionCard title="Validate referral code" description="Check a code presented by a new customer.">
          <ValidateReferralForm />
        </SectionCard>
      </div>

      <SectionCard className="mt-6" title="All referrals" flush>
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-4">
          {[['', 'All'], ['active', 'Active'], ['redeemed', 'Redeemed'], ['expired', 'Expired']].map(([value, label]) => (
            <Link key={label} href={value ? `/referrals?status=${value}` : '/referrals'} className={`btn btn-sm ${statusFilter === (value || null) ? 'btn-primary' : 'btn-secondary'}`}>{label}</Link>
          ))}
        </div>
        {referrals && referrals.length > 0 ? (
          <div className="scroll-thin overflow-x-auto">
            <table className="data-table data-table-hover">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Referrer</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Redeemed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <code className="rounded-md bg-surface-muted px-2 py-1 font-mono text-[13px] font-medium tracking-wide text-ink ring-1 ring-inset ring-line-strong/60">
                          {referral.code}
                        </code>
                        <CopyButton value={referral.code} />
                      </div>
                    </td>
                    <td className="text-ink">{customerNameById.get(referral.referrer_customer_id) ?? '\u2014'}</td>
                    <td>
                      <Badge tone={referral.status === 'redeemed' ? 'success' : referral.status === 'expired' ? 'danger' : 'warning'} dot className="capitalize">
                        {referral.status}
                      </Badge>
                    </td>
                    <td>{new Date(referral.created_at).toLocaleDateString('en-GB')}</td>
                    <td>{referral.redeemed_at ? new Date(referral.redeemed_at).toLocaleDateString('en-GB') : '\u2014'}</td>
                    <td><DeleteReferralButton referralId={referral.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="userPlus"
            title="No referrals yet"
            description="Generate a code for a happy customer and track who they bring in."
            className="py-10"
          />
        )}
      </SectionCard>
    </div>
  );
}
