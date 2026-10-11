-- Reputation tracking that works without Google, plus Google location/sync-job bookkeeping. Safe to re-run.
-- (review_alerts already exists from 0019 and is reused for every review source.)
-- Writes happen server-side (service role); business members can read their own rows.

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

notify pgrst, 'reload schema';
