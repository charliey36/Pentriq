-- Migration: the 14-day free trial is claimed by the user, not started at signup.
--
-- Before: businesses.trial_ends_at defaulted to now() + 14 days, so every new
-- account was mid-trial from the moment it was created.
-- After:  trial_ends_at is NULL until the owner claims the trial
-- (Settings -> Billing). Claiming sets trial_claimed_at and trial_ends_at.
--
-- Existing businesses are grandfathered: their trial is treated as already
-- claimed at signup, so nobody's current access changes. Safe to re-run.

alter table public.businesses
  add column if not exists trial_claimed_at timestamptz;

-- Grandfather existing rows (only rows that still have a trial end date and
-- have not been marked yet, so re-running never touches unclaimed accounts).
update public.businesses
   set trial_claimed_at = created_at
 where trial_claimed_at is null
   and trial_ends_at is not null;

alter table public.businesses alter column trial_ends_at drop not null;
alter table public.businesses alter column trial_ends_at drop default;

notify pgrst, 'reload schema';
