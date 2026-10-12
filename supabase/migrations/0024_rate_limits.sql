-- Migration: shared rate limiter for public (unauthenticated) endpoints.
--
-- Vercel runs many short-lived server instances, so an in-memory counter does
-- not limit anything. This keeps a fixed-window counter in Postgres instead.
-- `rate_limit_hit` is atomic (single upsert) and returns true while the caller
-- is still within the limit. RLS is on with no policies and the function is
-- executable by the service role only, so browsers cannot read or reset it.
-- Safe to re-run.

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Opportunistic cleanup so the table stays small without a separate job.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

notify pgrst, 'reload schema';
