-- Booking-system connections (Square, Acuity, Calendly, ...). One row per business per provider.
-- Tokens are stored encrypted (AES-256-GCM, same key as Google tokens). RLS is on with NO policies, so
-- only the service role can read this table; the app shows members a token-free view via the admin client.
-- Additive and safe to re-run.

create table if not exists public.booking_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('square', 'acuity', 'calendly')),
  status text not null default 'active' check (status in ('active', 'needs_reconnect', 'disconnected')),
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  account_label text,
  consent_confirmed_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_message text,
  last_sync_imported integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider)
);
alter table public.booking_connections enable row level security;

notify pgrst, 'reload schema';
