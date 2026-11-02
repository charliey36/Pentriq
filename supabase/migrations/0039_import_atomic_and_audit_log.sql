-- Migration 0039: atomic import writes + audit log.
--
-- 1. import_apply_visits: records service visits AND bumps the owning customers' totals in ONE
--    transaction. Previously these were separate calls, so a failure between them followed by a
--    retry could count the same spend twice. Totals are derived from the rows inserted in the same
--    call and applied as increments (no read-modify-write race). SECURITY INVOKER: row-level
--    security still applies, and every row is pinned to p_business_id.
-- 2. audit_log: append-only record of sensitive actions per business (who, what, when, from where).
--    Read by the admin portal through the service role; no policies = no browser access.
-- Additive and safe to re-run.

create or replace function public.import_apply_visits(p_business_id uuid, p_visits jsonb)
returns table (id uuid, customer_id uuid, service_id uuid, visited_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with ins as (
    insert into public.visits as v (business_id, customer_id, service_id, visited_at, price, notes, staff_name)
    select p_business_id,
           (x->>'customer_id')::uuid,
           nullif(x->>'service_id', '')::uuid,
           (x->>'visited_at')::timestamptz,
           nullif(x->>'price', '')::numeric,
           x->>'notes',
           nullif(x->>'staff_name', '')
    from jsonb_array_elements(p_visits) as x
    returning v.id, v.customer_id, v.service_id, v.visited_at, v.price
  ),
  agg as (
    select i.customer_id as cid, count(*) as cnt, coalesce(sum(i.price), 0) as spend, max(i.visited_at)::date as latest
    from ins i group by i.customer_id
  ),
  upd as (
    update public.customers c
       set visit_count = coalesce(c.visit_count, 0) + a.cnt,
           total_spend = coalesce(c.total_spend, 0) + a.spend,
           last_service_date = greatest(c.last_service_date, a.latest)
      from agg a
     where c.id = a.cid and c.business_id = p_business_id
    returning c.id
  )
  select i.id, i.customer_id, i.service_id, i.visited_at from ins i;
end;
$$;

revoke all on function public.import_apply_visits(uuid, jsonb) from public;
grant execute on function public.import_apply_visits(uuid, jsonb) to authenticated, service_role;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_business_created_idx on public.audit_log (business_id, created_at desc);
create index if not exists audit_log_action_idx on public.audit_log (action, created_at desc);
alter table public.audit_log enable row level security;

notify pgrst, 'reload schema';
