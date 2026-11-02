-- Migration 0043: outbound webhooks (Pentriq -> the customer's own systems).
--
-- webhook_endpoints: at most one endpoint per business. The signing secret is stored ENCRYPTED (same AES-GCM
--   helper as Google tokens) because it must be recoverable to sign payloads; it is shown to the user once.
-- webhook_deliveries: log of every attempt (status, HTTP code, duration, short error), newest 50 shown in the UI.
-- RLS is on with no policies: only server code (service role) can touch either table.
-- Additive and safe to re-run.

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  url text not null,
  secret_encrypted text not null,
  events text[] not null default '{customer.created,feedback.received}',
  is_active boolean not null default true,
  consecutive_failures integer not null default 0,
  disabled_reason text,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.webhook_endpoints enable row level security;

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  endpoint_id uuid references public.webhook_endpoints (id) on delete cascade,
  event_type text not null,
  status text not null check (status in ('succeeded', 'failed')),
  http_status integer,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_business_created_idx on public.webhook_deliveries (business_id, created_at desc);
alter table public.webhook_deliveries enable row level security;

notify pgrst, 'reload schema';
