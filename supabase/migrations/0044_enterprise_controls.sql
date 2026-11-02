-- Migration 0044: enterprise controls.
--
-- 1. Role-aware row-level security for configuration tables. Until now RLS proved only "is a member of this
--    business", so a staff user holding their own session and the public anon key could write configuration
--    rows directly through PostgREST, bypassing the app's capability checks. These are RESTRICTIVE policies:
--    Postgres ANDs them with the existing permissive membership policies, so they can only ever narrow access
--    (whatever the existing policies are named) and never widen it. The service role bypasses RLS, so
--    provisioning and background jobs are unaffected.
--      services            update/delete: owner or admin   (insert stays open to members: CSV import by any
--                                                           member may create a service by name)
--      loyalty_programs    insert/update/delete: owner or admin
--      referral_promotions insert/update/delete: owner or admin
--      journeys            insert/update/delete: owner or admin
-- 2. saved_views: named, shareable filters (customers list, segments, activity, feedback). Server-only table
--    (RLS on, no policies), read and written by server actions after a capability check, like team_invitations.
-- 3. businesses.data_retention_days: optional retention policy for message history and tracking events
--    (NULL = keep). Applied nightly by /api/apply-retention. Customers, visits and feedback are never purged.
-- Additive and safe to re-run.

-- 1. Restrictive role policies --------------------------------------------------------------------------------

drop policy if exists "Only owner or admin can update services" on public.services;
create policy "Only owner or admin can update services" on public.services
  as restrictive for update to authenticated
  using (exists (select 1 from public.business_members m where m.business_id = services.business_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')))
  with check (exists (select 1 from public.business_members m where m.business_id = services.business_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')));

drop policy if exists "Only owner or admin can delete services" on public.services;
create policy "Only owner or admin can delete services" on public.services
  as restrictive for delete to authenticated
  using (exists (select 1 from public.business_members m where m.business_id = services.business_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')));

do $$
declare
  t text;
begin
  foreach t in array array['loyalty_programs', 'referral_promotions', 'journeys'] loop
    execute format('drop policy if exists %I on public.%I', 'Only owner or admin can insert ' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (exists (select 1 from public.business_members m where m.business_id = %I.business_id and m.user_id = auth.uid() and m.role in (''owner'', ''admin'')))',
      'Only owner or admin can insert ' || t, t, t
    );
    execute format('drop policy if exists %I on public.%I', 'Only owner or admin can update ' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (exists (select 1 from public.business_members m where m.business_id = %I.business_id and m.user_id = auth.uid() and m.role in (''owner'', ''admin''))) with check (exists (select 1 from public.business_members m where m.business_id = %I.business_id and m.user_id = auth.uid() and m.role in (''owner'', ''admin'')))',
      'Only owner or admin can update ' || t, t, t, t
    );
    execute format('drop policy if exists %I on public.%I', 'Only owner or admin can delete ' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (exists (select 1 from public.business_members m where m.business_id = %I.business_id and m.user_id = auth.uid() and m.role in (''owner'', ''admin'')))',
      'Only owner or admin can delete ' || t, t, t
    );
  end loop;
end $$;

-- 2. Saved views ----------------------------------------------------------------------------------------------

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  scope text not null check (scope in ('customers', 'segments', 'activity', 'feedback')),
  name text not null check (char_length(name) between 1 and 60),
  query text not null default '' check (char_length(query) <= 500),
  shared boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists saved_views_business_scope_idx on public.saved_views (business_id, scope, created_at desc);
alter table public.saved_views enable row level security;

-- 3. Data retention -------------------------------------------------------------------------------------------

alter table public.businesses add column if not exists data_retention_days integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_data_retention_days_check') then
    alter table public.businesses
      add constraint businesses_data_retention_days_check check (data_retention_days is null or data_retention_days between 90 and 3650);
  end if;
end $$;

-- Retention deletes old tracking rows by date; these keep the nightly purge an index range scan.
create index if not exists messages_business_created_idx on public.messages (business_id, created_at);
create index if not exists interaction_events_business_occurred_idx on public.interaction_events (business_id, occurred_at);

notify pgrst, 'reload schema';
