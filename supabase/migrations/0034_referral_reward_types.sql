-- Referral promotions: each side (referrer / referred customer) is either a
-- number of loyalty points or free-text reward. The *_reward text columns keep
-- the human-readable label (e.g. "100 Loyalty Points") so existing readers and
-- historical referral snapshots keep working. Additive and safe to re-run.
alter table public.referral_promotions add column if not exists referrer_reward_type text not null default 'custom';
alter table public.referral_promotions add column if not exists referrer_points integer;
alter table public.referral_promotions add column if not exists customer_reward_type text not null default 'custom';
alter table public.referral_promotions add column if not exists customer_points integer;

alter table public.referral_promotions drop constraint if exists referral_promotions_referrer_reward_type_check;
alter table public.referral_promotions add constraint referral_promotions_referrer_reward_type_check check (referrer_reward_type in ('points', 'custom'));
alter table public.referral_promotions drop constraint if exists referral_promotions_customer_reward_type_check;
alter table public.referral_promotions add constraint referral_promotions_customer_reward_type_check check (customer_reward_type in ('points', 'custom'));
alter table public.referral_promotions drop constraint if exists referral_promotions_points_check;
alter table public.referral_promotions add constraint referral_promotions_points_check check ((referrer_points is null or referrer_points > 0) and (customer_points is null or customer_points > 0));

notify pgrst, 'reload schema';
