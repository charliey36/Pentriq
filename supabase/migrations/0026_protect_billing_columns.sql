-- Migration: stop customers editing their own billing state from the browser.
--
-- The "Owner can manage own business" policy is `for all`, so any signed-in
-- owner could run, with the public anon key and their own session:
--     update businesses set subscription_status = 'active', trial_ends_at = '2099-01-01' ...
-- or insert their business row already marked `active`. RLS cannot restrict
-- individual columns, so a trigger does it.
--
-- Rule: requests made as the `authenticated` / `anon` roles (i.e. from a
-- browser or any client using the anon key) may not set or change the billing
-- and ownership columns below, and may not delete the business row (account
-- deletion must go through Settings → Data & privacy, which cancels Stripe
-- first). The service role (our server code, Stripe
-- webhooks, cron jobs) and the SQL editor (role postgres) are unaffected.
--
-- The function is deliberately SECURITY INVOKER: that is what makes
-- current_user be the caller's role instead of the function owner.
-- Safe to re-run.

create or replace function public.protect_business_billing_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Deleting a business must go through Settings → Data & privacy, which
  -- cancels the Stripe subscription first. A direct delete from the browser
  -- would leave an active subscription billing a business that no longer exists.
  if tg_op = 'DELETE' then
    raise exception 'businesses can only be deleted through the account deletion flow'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- A client-created business always starts with no trial, no subscription.
    new.subscription_status := 'trialing';
    new.trial_ends_at := null;
    new.trial_claimed_at := null;
    new.current_period_end := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.trial_claimed_at is distinct from old.trial_claimed_at
     or new.current_period_end is distinct from old.current_period_end
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  then
    raise exception 'billing and ownership fields can only be changed by the server'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_business_billing_columns on public.businesses;
create trigger protect_business_billing_columns
  before insert or update or delete on public.businesses
  for each row execute function public.protect_business_billing_columns();

notify pgrst, 'reload schema';
