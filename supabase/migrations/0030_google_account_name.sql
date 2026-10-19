-- Store the Google account display name returned during OAuth account discovery.
-- Nullable for existing connections; safe to re-run.
alter table public.google_business_connections
  add column if not exists google_account_name text;

notify pgrst, 'reload schema';
