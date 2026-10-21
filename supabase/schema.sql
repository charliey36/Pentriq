-- Pentriq schema — full platform migration.
-- Adds team support, service/visit history, generalized multi-channel
-- messaging + journeys, compliant private feedback, segmentation, loyalty,
-- and referrals on top of the original MVP tables. Additive only — nothing
-- destructive. Run this file on a fresh project; existing projects should
-- run supabase/migrations/0001_retry_and_consent.sql, then
-- supabase/migrations/0002_platform.sql (this file), then
-- supabase/migrations/0003_fix_missing_columns.sql. All projects (fresh or
-- existing) additionally need supabase/migrations/0004_business_logo_storage.sql,
-- which creates the public `business-logos` Storage bucket used by the
-- Settings page's profile picture uploader — storage buckets/policies
-- aren't part of this schema.sql file at all, since `storage.objects` lives
-- outside the `public` schema this file otherwise manages.
--
-- PITFALL (fixed as of 0003, documented here so it isn't reintroduced):
-- `create table if not exists` is a complete no-op if the table already
-- exists — it does NOT add new columns to an existing table, even if the
-- column is listed in the statement. Any column added to `businesses` or
-- `customers` (both of which pre-date this platform build-out) after the
-- table already existed in a given database must be added via an explicit
-- `alter table ... add column if not exists`, not just by editing the
-- `create table` statement below. New tables are unaffected by this and
-- can keep using `create table if not exists` as normal.


-- ---------------------------------------------------------------------------
-- businesses
--
-- See the note on the `customers` table below for why brand_logo_url and
-- brand_primary_color are added via explicit `alter table`, not just listed
-- in the `create table` statement: `businesses` also pre-dates this version
-- of the schema, so columns added only to the create-table statement here
-- would silently never be created on this (or any already-provisioned)
-- database.
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Business',
  google_review_url text not null default '',
  delay_hours numeric not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

alter table public.businesses
  add column if not exists brand_logo_url text,
  add column if not exists brand_primary_color text,
  add column if not exists booking_url text,
  add column if not exists booking_url_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- business_members
-- Team support. owner_id on `businesses` remains the ultimate owner (billing
-- etc.), but access control for every other table is now checked through
-- this join table so a business can eventually have more than one user.
-- A row for the owner is created automatically wherever a business is
-- created (see requireBusiness()).
-- ---------------------------------------------------------------------------
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists business_members_user_id_idx on public.business_members (user_id);

-- ---------------------------------------------------------------------------
-- customers
--
-- IMPORTANT: `create table if not exists` is a no-op on every column in
-- this statement if the table already exists — Postgres does NOT retroactively
-- add new columns to a pre-existing table this way. `customers` pre-dates
-- this version of the schema (it existed in the original MVP), so phone,
-- date_of_birth, source, and unsubscribed_sms_at are added explicitly below
-- via `alter table ... add column if not exists`, which works correctly
-- regardless of whether the table is new or pre-existing. Any future
-- column added to this table MUST follow the same alter-table pattern, not
-- just be added to the create-table statement above, or it will silently
-- never be created on any database where `customers` already exists.
-- (See supabase/migrations/0003_fix_missing_columns.sql for the incident
-- this caused in production and the fix.)
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  email text not null,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.customers
  add column if not exists phone text,
  add column if not exists date_of_birth date,
  add column if not exists source text,
  add column if not exists unsubscribed_sms_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists consent_confirmed_at timestamptz; -- see migration 0025

create index if not exists customers_business_id_idx on public.customers (business_id);

-- ---------------------------------------------------------------------------
-- customer_tags
-- Many-to-many free-text tags, the simplest possible segmentation primitive.
-- ---------------------------------------------------------------------------
create table if not exists public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (customer_id, tag)
);

create index if not exists customer_tags_business_id_tag_idx on public.customer_tags (business_id, tag);
create index if not exists customer_tags_customer_id_idx on public.customer_tags (customer_id);

-- ---------------------------------------------------------------------------
-- services
-- Service catalog. recurrence_interval_days drives rebooking reminders.
-- ---------------------------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  recurrence_interval_days integer,
  default_price numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists services_business_id_idx on public.services (business_id);

-- ---------------------------------------------------------------------------
-- visits
-- Service history — the foundation for rebooking reminders, CLV, and health
-- scoring. Logged manually from the customer detail page (no POS/calendar
-- integration in this version).
-- ---------------------------------------------------------------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  visited_at timestamptz not null default now(),
  price numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists visits_business_id_idx on public.visits (business_id);
create index if not exists visits_customer_id_visited_at_idx on public.visits (customer_id, visited_at desc);

-- ---------------------------------------------------------------------------
-- messages
-- Generalized replacement for the single-purpose `review_requests` table.
-- Every outbound message of any purpose/channel is a row here. Retry
-- support (attempts/max_attempts/next_attempt_at) carries over from
-- review_requests. `review_requests` is kept as-is for backward
-- compatibility (the original review-request flow still writes to it
-- directly) — `messages` is used by every *new* feature (sequences,
-- rebooking reminders, win-back, birthday).
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  purpose text not null check (purpose in (
    'review_request', 'review_reminder', 'rebooking_reminder',
    'win_back', 'birthday', 'referral', 'loyalty', 'custom'
  )),
  channel text not null default 'email' check (channel in ('email', 'sms', 'whatsapp')),
  journey_enrollment_id uuid,
  sequence_step integer not null default 1,
  status text not null default 'pending' check (status in ('queued', 'pending', 'sent', 'failed', 'cancelled')),
  send_at timestamptz not null,
  sent_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  visit_id uuid references public.visits (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Per-send click tracking (migration 0018): unguessable token for the emailed
-- /r/{token} link plus click counters.
alter table public.messages
  add column if not exists tracking_token text not null default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists click_count integer not null default 0,
  add column if not exists first_clicked_at timestamptz,
  add column if not exists last_clicked_at timestamptz,
  add column if not exists destination_url text;
create unique index if not exists messages_tracking_token_key on public.messages (tracking_token);

create index if not exists messages_business_id_idx on public.messages (business_id);
create index if not exists messages_status_send_at_idx on public.messages (status, send_at);
create index if not exists messages_status_next_attempt_idx on public.messages (status, next_attempt_at);
create index if not exists messages_customer_id_purpose_idx on public.messages (customer_id, purpose, created_at);

-- ---------------------------------------------------------------------------
-- interaction_events
-- Generalized replacement/superset of `click_events`. Any trackable
-- customer interaction (click, review confirmation, feedback submission).
-- ---------------------------------------------------------------------------
create table if not exists public.interaction_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  event_type text not null check (event_type in ('click', 'review_confirmed', 'feedback_submitted', 'review_link_clicked', 'review_link_scan')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- Click-tracking detail (see supabase/migrations/0018_review_link_click_tracking.sql).
-- review_link_clicked = counted human click; review_link_scan = automated hit
-- (kept for audit, never counted); 'click' = historical rows.
alter table public.interaction_events drop constraint if exists interaction_events_event_type_check;
alter table public.interaction_events add constraint interaction_events_event_type_check
  check (event_type in ('click', 'review_confirmed', 'feedback_submitted', 'review_link_clicked', 'review_link_scan'));
alter table public.interaction_events
  add column if not exists review_request_id uuid,
  add column if not exists campaign_id uuid,
  add column if not exists user_agent text,
  add column if not exists ip_address text,
  add column if not exists destination_url text;

create index if not exists interaction_events_business_id_idx on public.interaction_events (business_id, event_type, occurred_at);
create index if not exists interaction_events_message_id_idx on public.interaction_events (message_id);

-- ---------------------------------------------------------------------------
-- private_feedback
-- Compliant alternative to "review gating": every review request/landing
-- page shows BOTH the public review link AND this private feedback option,
-- unconditionally, to 100% of customers. Never used to decide whether to
-- show the public link — see src/lib/compliance.ts for the enforced
-- invariant and its accompanying tests.
-- ---------------------------------------------------------------------------
create table if not exists public.private_feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  rating integer check (rating between 1 and 5),
  comment text not null,
  status text not null default 'new' check (status in ('new', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists private_feedback_business_id_idx on public.private_feedback (business_id, status, created_at);

-- ---------------------------------------------------------------------------
-- journeys / journey_enrollments
-- Minimal journey engine: a journey is an ordered list of steps (jsonb) —
-- {wait_hours, channel, purpose, template}. Enrollments track where each
-- customer is in a given journey. Used by review sequences, rebooking
-- reminders, win-back, and birthday campaigns alike.
-- ---------------------------------------------------------------------------
create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key text not null check (key in ('review_sequence', 'rebooking_reminder', 'win_back', 'birthday')),
  name text not null,
  is_active boolean not null default true,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);

create table if not exists public.journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  current_step integer not null default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'exited')),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journey_enrollments_journey_status_idx on public.journey_enrollments (journey_id, status);
create index if not exists journey_enrollments_customer_id_idx on public.journey_enrollments (customer_id);

-- ---------------------------------------------------------------------------
-- segments
-- Saved dynamic segment definitions. rule_definition is a small structured
-- JSON (field/operator/value conditions, ANDed) evaluated live at read time
-- by src/lib/segments.ts — never persisted as a static member list.
-- ---------------------------------------------------------------------------
create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  rule_definition jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists segments_business_id_idx on public.segments (business_id);

-- ---------------------------------------------------------------------------
-- loyalty_programs / loyalty_ledger_entries / loyalty_rewards
-- Points ledger is append-only; balance is always a derived sum, never a
-- mutable field, so there is no code path that can corrupt a balance by
-- editing history.
-- ---------------------------------------------------------------------------
create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  is_active boolean not null default false,
  points_per_visit integer not null default 10,
  points_per_referral integer not null default 50,
  points_per_review integer not null default 20,
  redemption_points integer not null default 100,
  redemption_reward_description text not null default '$10 off your next visit',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create table if not exists public.loyalty_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('visit', 'referral', 'review', 'redemption', 'birthday', 'manual')),
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_ledger_customer_id_idx on public.loyalty_ledger_entries (customer_id, created_at);

-- ---------------------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------------------
create table if not exists public.referral_promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text not null default '',
  customer_reward text not null,
  referrer_reward text not null,
  referrer_reward_type text not null default 'custom' check (referrer_reward_type in ('points', 'custom')),
  referrer_points integer check (referrer_points is null or referrer_points > 0),
  customer_reward_type text not null default 'custom' check (customer_reward_type in ('points', 'custom')),
  customer_points integer check (customer_points is null or customer_points > 0),
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


create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  referrer_customer_id uuid not null references public.customers (id) on delete cascade,
  referee_customer_id uuid references public.customers (id) on delete set null,
  code text not null,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  reward_granted_at timestamptz,
  redeemed_at timestamptz,
  promotion_id uuid references public.referral_promotions (id) on delete set null,
  promotion_name text,
  customer_reward text,
  referrer_reward text,
  created_at timestamptz not null default now(),
  unique (business_id, code)
);

create index if not exists referrals_business_id_idx on public.referrals (business_id);
create index if not exists referrals_referrer_customer_id_idx on public.referrals (referrer_customer_id);

-- ---------------------------------------------------------------------------
-- import_jobs
-- Lightweight record of CSV import runs (the import itself is synchronous
-- in this version — this table is just a history log, not a job queue).
-- ---------------------------------------------------------------------------
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  total_rows integer not null default 0,
  success_count integer not null default 0,
  error_count integer not null default 0,
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists import_jobs_business_id_idx on public.import_jobs (business_id);

-- ---------------------------------------------------------------------------
-- Pre-existing tables kept for backward compatibility
-- ---------------------------------------------------------------------------
create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  send_at timestamptz not null,
  sent_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists review_requests_business_id_idx on public.review_requests (business_id);
create index if not exists review_requests_status_send_at_idx on public.review_requests (status, send_at);
create index if not exists review_requests_status_next_attempt_idx on public.review_requests (status, next_attempt_at);

create table if not exists public.click_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  review_request_id uuid not null references public.review_requests (id) on delete cascade,
  clicked_at timestamptz not null default now()
);

create index if not exists click_events_business_id_idx on public.click_events (business_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Every per-business table is scoped via business_members, so a business
-- can later have more than one user without any RLS rewrite. The scheduled
-- jobs and public tracking/feedback/unsubscribe endpoints run with the
-- service role key, which bypasses RLS by design.
-- ---------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.customers enable row level security;
alter table public.customer_tags enable row level security;
alter table public.services enable row level security;
alter table public.visits enable row level security;
alter table public.messages enable row level security;
alter table public.interaction_events enable row level security;
alter table public.private_feedback enable row level security;
alter table public.journeys enable row level security;
alter table public.journey_enrollments enable row level security;
alter table public.segments enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_ledger_entries enable row level security;
alter table public.referrals enable row level security;
alter table public.import_jobs enable row level security;
alter table public.review_requests enable row level security;
alter table public.click_events enable row level security;

drop policy if exists "Owner can manage own business" on public.businesses;
create policy "Owner can manage own business"
  on public.businesses
  for all
  using (id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (owner_id = auth.uid());

drop policy if exists "Member can view own membership" on public.business_members;
create policy "Member can view own membership"
  on public.business_members
  for select
  using (user_id = auth.uid());

-- Generic per-business policy, reused verbatim (modulo table name) for every
-- business-scoped table below.
drop policy if exists "Member can manage own customers" on public.customers;
create policy "Member can manage own customers"
  on public.customers
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own customer_tags" on public.customer_tags;
create policy "Member can manage own customer_tags"
  on public.customer_tags
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own services" on public.services;
create policy "Member can manage own services"
  on public.services
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own visits" on public.visits;
create policy "Member can manage own visits"
  on public.visits
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own messages" on public.messages;
create policy "Member can manage own messages"
  on public.messages
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can view own interaction_events" on public.interaction_events;
create policy "Member can view own interaction_events"
  on public.interaction_events
  for select
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own private_feedback" on public.private_feedback;
create policy "Member can manage own private_feedback"
  on public.private_feedback
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own journeys" on public.journeys;
create policy "Member can manage own journeys"
  on public.journeys
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own journey_enrollments" on public.journey_enrollments;
create policy "Member can manage own journey_enrollments"
  on public.journey_enrollments
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own segments" on public.segments;
create policy "Member can manage own segments"
  on public.segments
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own loyalty_programs" on public.loyalty_programs;
create policy "Member can manage own loyalty_programs"
  on public.loyalty_programs
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own loyalty_ledger_entries" on public.loyalty_ledger_entries;
create policy "Member can manage own loyalty_ledger_entries"
  on public.loyalty_ledger_entries
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own referrals" on public.referrals;
create policy "Member can manage own referrals"
  on public.referrals
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can view own import_jobs" on public.import_jobs;
create policy "Member can view own import_jobs"
  on public.import_jobs
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can manage own review requests" on public.review_requests;
create policy "Member can manage own review requests"
  on public.review_requests
  for all
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

drop policy if exists "Member can view own click events" on public.click_events;
create policy "Member can view own click events"
  on public.click_events
  for select
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Keep updated_at columns fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row
  execute function public.set_updated_at();

drop trigger if exists journeys_set_updated_at on public.journeys;
create trigger journeys_set_updated_at
  before update on public.journeys
  for each row
  execute function public.set_updated_at();

drop trigger if exists journey_enrollments_set_updated_at on public.journey_enrollments;
create trigger journey_enrollments_set_updated_at
  before update on public.journey_enrollments
  for each row
  execute function public.set_updated_at();

drop trigger if exists loyalty_programs_set_updated_at on public.loyalty_programs;
create trigger loyalty_programs_set_updated_at
  before update on public.loyalty_programs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill business_members from existing businesses.owner_id, and seed a
-- default review_sequence journey for every existing business, so this
-- migration is safe to run against a database that already has data.
-- ---------------------------------------------------------------------------
insert into public.business_members (business_id, user_id, role)
select id, owner_id, 'owner' from public.businesses
on conflict (business_id, user_id) do nothing;

insert into public.journeys (business_id, key, name, steps)
select
  id,
  'review_sequence',
  'Review request sequence',
  '[
    {"wait_hours": 0, "channel": "email", "purpose": "review_request"},
    {"wait_hours": 72, "channel": "email", "purpose": "review_reminder"},
    {"wait_hours": 168, "channel": "email", "purpose": "review_reminder"}
  ]'::jsonb
from public.businesses
on conflict (business_id, key) do nothing;

insert into public.journeys (business_id, key, name, steps)
select id, 'rebooking_reminder', 'Rebooking reminder', '[{"wait_hours": 0, "channel": "email", "purpose": "rebooking_reminder"}]'::jsonb
from public.businesses
on conflict (business_id, key) do nothing;

insert into public.journeys (business_id, key, name, steps)
select id, 'win_back', 'Win-back campaign', '[{"wait_hours": 0, "channel": "email", "purpose": "win_back"}]'::jsonb
from public.businesses
on conflict (business_id, key) do nothing;

insert into public.journeys (business_id, key, name, steps)
select id, 'birthday', 'Birthday campaign', '[{"wait_hours": 0, "channel": "email", "purpose": "birthday"}]'::jsonb
from public.businesses
on conflict (business_id, key) do nothing;

-- Billing columns (see supabase/migrations/0005_billing.sql)
alter table public.businesses
  add column if not exists subscription_status text not null default 'trialing',
  add column if not exists trial_ends_at timestamptz, -- NULL until the owner claims the trial (migration 0023)
  add column if not exists trial_claimed_at timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- Onboarding + notification flags (see supabase/migrations/0006)
alter table public.businesses
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists campaign_email_sent_at timestamptz,
  add column if not exists trial_ending_email_sent_at timestamptz;

-- Service dates + review settings (see migrations/0007)
alter table public.customers add column if not exists last_service_date date;
alter table public.businesses
  add column if not exists review_request_window_days integer not null default 1,
  add column if not exists rebooking_reminder_interval_days integer not null default 30;

-- Integrations (see migrations/0008)
alter table public.customers
  add column if not exists total_spend numeric not null default 0,
  add column if not exists visit_count integer not null default 0;

-- One API key per business. Only a SHA-256 hash is stored; the plaintext key
-- is shown once at generation. RLS on with no policies = server (service role) only.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.api_keys enable row level security;

-- Integration events (see migrations/0010)
create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  source text not null default 'api' check (source in ('api', 'test')),
  endpoint text not null,
  status text not null check (status in ('imported', 'updated', 'duplicate', 'failed')),
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists integration_events_business_created_idx
  on public.integration_events (business_id, created_at desc);
alter table public.integration_events enable row level security; -- server-only (service role)

-- Review queue (see migrations/0011)
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('queued', 'pending', 'sent', 'failed', 'cancelled'));

-- The service visit a queued review request is about (shown in the queue).
alter table public.messages add column if not exists visit_id uuid references public.visits (id) on delete set null;

-- Rebooking toggle (see migrations/0012)
alter table public.businesses add column if not exists rebooking_reminders_enabled boolean not null default true;

-- Google Business Profile integration (see migrations/0019)
-- google_business_connections is server-only (tokens): RLS on, no policies.
create table if not exists public.google_business_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  google_account_id text not null,          -- numeric id from "accounts/{id}"
  google_account_name text,
  google_location_id text,                  -- numeric id from "locations/{id}"; null until a location is chosen
  location_name text,
  access_token text not null,               -- encrypted ("v1:iv:tag:ciphertext")
  refresh_token text not null,              -- encrypted
  token_expires_at timestamptz,
  status text not null default 'pending_location'
    check (status in ('pending_location', 'active', 'needs_reconnect')),
  rating_alert_threshold numeric(2,1) not null default 4.0
    check (rating_alert_threshold between 1 and 5),
  initial_sync_done boolean not null default false,
  last_sync_error text,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);
alter table public.google_business_connections enable row level security; -- server-only (service role)

create table if not exists public.google_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  google_review_id text not null,
  reviewer_name text not null default 'Anonymous',
  reviewer_photo_url text,
  rating integer not null check (rating between 1 and 5),
  comment text,
  review_date timestamptz not null,         -- Google createTime
  update_time timestamptz not null,         -- Google updateTime
  reply_text text,
  reply_update_time timestamptz,
  synced_at timestamptz not null default now(),
  unique (business_id, google_review_id)
);
create index if not exists google_reviews_business_date_idx
  on public.google_reviews (business_id, review_date desc);
alter table public.google_reviews enable row level security;
drop policy if exists "Member can view own google_reviews" on public.google_reviews;
create policy "Member can view own google_reviews"
  on public.google_reviews
  for select
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()));

create table if not exists public.review_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  total_reviews integer not null default 0,
  average_rating numeric(3,2) not null default 0,
  reviews_gained_today integer not null default 0,
  unique (business_id, date)
);
create index if not exists review_metrics_daily_business_date_idx
  on public.review_metrics_daily (business_id, date desc);
alter table public.review_metrics_daily enable row level security;
drop policy if exists "Member can view own review_metrics_daily" on public.review_metrics_daily;
create policy "Member can view own review_metrics_daily"
  on public.review_metrics_daily
  for select
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()));

-- In-app review alerts. dedupe_key makes alert generation idempotent across
-- repeated sync runs.
create table if not exists public.review_alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null check (type in ('new_review', 'new_one_star', 'low_rating', 'rating_decrease')),
  title text not null,
  message text not null,
  google_review_id text,
  dedupe_key text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, dedupe_key)
);
create index if not exists review_alerts_business_created_idx
  on public.review_alerts (business_id, created_at desc);
alter table public.review_alerts enable row level security;
drop policy if exists "Member can view own review_alerts" on public.review_alerts;
create policy "Member can view own review_alerts"
  on public.review_alerts
  for select
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()));
drop policy if exists "Member can update own review_alerts" on public.review_alerts;
create policy "Member can update own review_alerts"
  on public.review_alerts
  for update
  using (business_id in (select business_id from public.business_members where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_members where user_id = auth.uid()));

-- Granted OAuth scopes (see migrations/0020)
alter table public.google_business_connections add column if not exists granted_scopes text;

-- Reputation tracking + Google bookkeeping (see migrations/0021)
create table if not exists public.review_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  source_name text not null,
  source_type text not null check (source_type in ('manual', 'google')),
  connected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, source_type)
);

create table if not exists public.manual_review_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  snapshot_date date not null,
  review_count integer not null check (review_count >= 0),
  average_rating numeric(3,2) not null check (average_rating between 0 and 5),
  created_at timestamptz not null default now(),
  unique (business_id, snapshot_date)
);

-- Monthly roll-up derived from snapshots (manual or Google); rebuilt on every change.
create table if not exists public.review_metrics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  reviews_gained integer not null default 0,
  rating_change numeric(3,2) not null default 0,
  average_rating numeric(3,2) not null default 0,
  review_count integer not null default 0,
  calculated_at timestamptz not null default now(),
  unique (business_id, period)
);

-- Locations discovered on the connected Google account.
create table if not exists public.google_business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  google_account_id text not null,
  google_location_id text not null,
  title text not null,
  address text,
  created_at timestamptz not null default now(),
  unique (business_id, google_account_id, google_location_id)
);

-- One row per Google sync run (audit trail for support).
create table if not exists public.google_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  trigger text not null check (trigger in ('initial', 'scheduled', 'manual')),
  status text not null check (status in ('succeeded', 'failed')),
  fetched integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  alerts integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists google_sync_jobs_business_idx on public.google_sync_jobs (business_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['review_sources','manual_review_snapshots','review_metrics','google_business_locations','google_sync_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Member can view own %1$s" on public.%1$I', t);
    execute format('create policy "Member can view own %1$s" on public.%1$I for select using (business_id in (select business_id from public.business_members where user_id = auth.uid()))', t);
  end loop;
end $$;

-- Reload PostgREST's schema cache so columns added above are usable immediately.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Stripe subscriptions (see migrations/0022_stripe_subscriptions.sql)
-- ---------------------------------------------------------------------------

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

-- Optional review request cooldown (migration 0035).
alter table public.businesses add column if not exists review_cooldown_enabled boolean not null default false;
alter table public.businesses add column if not exists review_cooldown_days integer not null default 60;
