-- Set the defaults used for new businesses and newly created settings rows.
alter table public.businesses
  alter column review_request_window_days set default 1,
  alter column rebooking_reminder_interval_days set default 30;

notify pgrst, 'reload schema';
