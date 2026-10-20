-- Referral promotions. Referrals snapshot the promotion text, so deleting a
-- promotion never changes historical referrals. Additive and safe to re-run.
create table if not exists public.referral_promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text not null default '',
  customer_reward text not null,
  referrer_reward text not null,
  created_at timestamptz not null default now()
);
create index if not exists referral_promotions_business_id_idx on public.referral_promotions (business_id);

alter table public.referral_promotions enable row level security;
drop policy if exists "Member can manage own referral_promotions" on public.referral_promotions;
create policy "Member can manage own referral_promotions"
  on public.referral_promotions
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

alter table public.referrals add column if not exists promotion_id uuid references public.referral_promotions (id) on delete set null;
alter table public.referrals add column if not exists promotion_name text;
alter table public.referrals add column if not exists customer_reward text;
alter table public.referrals add column if not exists referrer_reward text;
notify pgrst, 'reload schema';
