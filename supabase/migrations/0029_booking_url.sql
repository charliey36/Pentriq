-- Migration: per-business Booking URL used by rebooking emails.
-- Nullable with no default, so existing businesses and campaigns keep working
-- (rebooking emails fall back to the Pentriq request page until a URL is set).
-- Safe to re-run.
alter table public.businesses add column if not exists booking_url text;
alter table public.businesses add column if not exists booking_url_updated_at timestamptz;

alter table public.businesses drop constraint if exists businesses_booking_url_http;
alter table public.businesses add constraint businesses_booking_url_http
  check (booking_url is null or booking_url ~* '^https?://') not valid;

notify pgrst, 'reload schema';
