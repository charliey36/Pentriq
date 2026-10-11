-- Migration: Stripe subscription mirror + webhook idempotency.
-- `businesses.subscription_status / current_period_end / stripe_*` (0005) stay
-- the fields the app reads for access control; webhooks write them AND the
-- richer `subscriptions` row below (raw Stripe status, price, cancel flag).
-- Safe to re-run.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_name text,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

-- Processed Stripe event ids, so retried webhook deliveries are no-ops.
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
drop policy if exists "Member can view own subscriptions" on public.subscriptions;
create policy "Member can view own subscriptions" on public.subscriptions
  for select using (business_id in (select business_id from public.business_members where user_id = auth.uid()));

-- Webhook table: RLS on with no policies => service role only.
alter table public.stripe_webhook_events enable row level security;

create index if not exists businesses_stripe_customer_idx on public.businesses (stripe_customer_id);

notify pgrst, 'reload schema';
