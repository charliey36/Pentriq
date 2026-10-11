-- Google Business Profile integration. Safe to re-run.
--
-- google_business_connections holds OAuth tokens (AES-256-GCM encrypted by the
-- app before they reach the database) so it is SERVER-ONLY: RLS on, no
-- policies, accessed through the service role. The other tables are readable
-- by business members; writes happen server-side (sync job / server actions).

create table if not exists public.google_business_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  google_account_id text not null,          -- numeric id from "accounts/{id}"
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

notify pgrst, 'reload schema';
