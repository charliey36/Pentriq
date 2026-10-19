-- Service-aware customers + organisation review settings. Safe to re-run.
alter table public.customers add column if not exists last_service_date date;
alter table public.businesses
  add column if not exists review_request_window_days integer not null default 1,
  add column if not exists rebooking_reminder_interval_days integer not null default 30;
