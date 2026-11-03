-- Migration 0045: hardening found by applying every migration and an RLS test suite to a real PostgreSQL server
-- (scripts/verify-db.sh, supabase/tests/), plus the organisation two-factor policy.
--
-- 1. import_apply_visits(): Supabase grants EXECUTE on new functions in schema public directly to anon and
--    authenticated (default privileges), so 0039's "revoke ... from public" left signed-out callers able to run it.
--    Row-level security still blocked every write (the function is SECURITY INVOKER), but anon has no reason to
--    call it at all.
-- 2. demo_company_records.business_id defaulted to one specific organisation, so an insert without a business_id
--    silently landed in that tenant. The default is dropped; such an insert now fails instead.
-- 3. businesses.require_mfa: owner-controlled policy. When true, every member must sign in with two-factor
--    authentication (enforced by the app on every signed-in request).
-- 4. rls_status(): lets the server-side launch-readiness console prove, against the live database, that every
--    table in schema public has row-level security enabled. Service role only.
-- 5. schema_migrations: a ledger. From this migration on each file records its own number, so the app can
--    report which migrations a database has.
-- Additive and safe to re-run.

-- 1
revoke execute on function public.import_apply_visits(uuid, jsonb) from anon;

-- 2
alter table public.demo_company_records alter column business_id drop default;

-- 3
alter table public.businesses add column if not exists require_mfa boolean not null default false;

-- 4
create or replace function public.rls_status()
returns table (table_name text, rls_enabled boolean, policy_count integer)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select c.relname::text,
         c.relrowsecurity,
         (select count(*)::integer from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  order by 1
$$;
revoke all on function public.rls_status() from public, anon, authenticated;
grant execute on function public.rls_status() to service_role;

-- 5
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security; -- server-only: no policies
insert into public.schema_migrations (version) values ('0045') on conflict (version) do nothing;

notify pgrst, 'reload schema';
