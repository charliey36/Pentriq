-- Code-based referrals: status lifecycle and redemption timestamp.
-- Maps legacy values (pending -> active, completed -> redeemed). Safe to re-run.
alter table public.referrals add column if not exists redeemed_at timestamptz;
alter table public.referrals drop constraint if exists referrals_status_check;
update public.referrals set status = 'active' where status = 'pending';
update public.referrals set status = 'redeemed', redeemed_at = coalesce(redeemed_at, reward_granted_at) where status = 'completed';
alter table public.referrals alter column status set default 'active';
alter table public.referrals add constraint referrals_status_check check (status in ('active', 'redeemed', 'expired'));
notify pgrst, 'reload schema';
