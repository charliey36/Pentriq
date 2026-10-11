-- Records which OAuth scopes Google actually granted for a connection, so a user who
-- unticks the Business Profile permission on the consent screen is detected. Safe to re-run.
alter table public.google_business_connections
  add column if not exists granted_scopes text;

notify pgrst, 'reload schema';
