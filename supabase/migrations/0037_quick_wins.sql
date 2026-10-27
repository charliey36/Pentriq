-- Quick wins: reminder toggle, message personalisation, weekly summary, pause,
-- milestone emails, opt-out suppression list and blocked-request counters.
-- Additive and safe to re-run. Existing businesses keep today's behaviour.

-- First run only: existing businesses must not receive "first import / first review" milestone
-- emails for things they did long ago, so every milestone starts as already sent for them.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'businesses' and column_name = 'milestones_sent') then
    alter table public.businesses add column milestones_sent jsonb not null default '{}'::jsonb;
    update public.businesses set milestones_sent = jsonb_build_object(
      'first_import', now()::text, 'first_20_requests', now()::text, 'first_review', now()::text, 'first_10_reviews', now()::text);
  end if;
end $$;

alter table public.businesses add column if not exists review_reminders_enabled boolean not null default true;
alter table public.businesses add column if not exists review_message_subject text;
alter table public.businesses add column if not exists review_message_body text;
alter table public.businesses add column if not exists weekly_summary_enabled boolean not null default true;
alter table public.businesses add column if not exists weekly_summary_sent_at timestamptz;
alter table public.businesses add column if not exists paused_at timestamptz;
alter table public.businesses add column if not exists paused_until timestamptz;
alter table public.businesses add column if not exists pause_indefinite boolean not null default false;
alter table public.businesses add column if not exists milestones_sent jsonb not null default '{}'::jsonb;

-- New businesses get the safer default (max one request per customer per 30 days).
-- Column defaults only apply to NEW rows, so existing businesses are unchanged.
alter table public.businesses alter column review_cooldown_enabled set default true;
alter table public.businesses alter column review_cooldown_days set default 30;

alter table public.visits add column if not exists staff_name text;

-- Per-business suppression list (opt-outs). Survives customer deletion / re-import.
create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null,
  reason text not null default 'unsubscribed',
  created_at timestamptz not null default now(),
  unique (business_id, email)
);
alter table public.email_suppressions enable row level security;
drop policy if exists "Member can view own suppressions" on public.email_suppressions;
create policy "Member can view own suppressions" on public.email_suppressions
  for select using (business_id in (select business_id from public.business_members where user_id = auth.uid()));

-- Review requests that were NOT created, and why (dashboard counters).
create table if not exists public.review_request_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  reason text not null check (reason in ('frequency', 'opt_out', 'duplicate')),
  created_at timestamptz not null default now()
);
create index if not exists review_request_blocks_business_idx on public.review_request_blocks (business_id, reason);
alter table public.review_request_blocks enable row level security;
drop policy if exists "Member can view own blocks" on public.review_request_blocks;
create policy "Member can view own blocks" on public.review_request_blocks
  for select using (business_id in (select business_id from public.business_members where user_id = auth.uid()));

-- One message per journey step: a step can never be scheduled (and so sent) twice.
do $$
begin
  create unique index if not exists messages_enrollment_step_uniq
    on public.messages (journey_enrollment_id, sequence_step)
    where journey_enrollment_id is not null and status <> 'cancelled';
exception when others then
  raise notice 'messages_enrollment_step_uniq not created (existing duplicate rows): %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
