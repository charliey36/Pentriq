-- 0017: make sure every column the Settings page reads/writes exists on
-- public.businesses, and reload PostgREST's schema cache.
--
-- Why this exists: saving Settings failed with
--   "Could not find the 'rebooking_reminders_enabled' column of 'businesses'
--    in the schema cache"
-- because 0012_rebooking_toggle.sql had never been applied to the live
-- database. This migration is idempotent and safe to run on any environment,
-- whether or not 0007 / 0012 were applied.
--
-- Settings columns (UI field -> column):
--   Business name              -> name                              (base schema)
--   Google review URL          -> google_review_url                 (base schema)
--   Review request window      -> review_request_window_days        (0007)
--   Rebooking reminder after   -> rebooking_reminder_interval_days  (0007)
--   Send rebooking reminders   -> rebooking_reminders_enabled       (0012)

alter table public.businesses
  add column if not exists review_request_window_days integer not null default 1,
  add column if not exists rebooking_reminder_interval_days integer not null default 30,
  add column if not exists rebooking_reminders_enabled boolean not null default true;

-- Tell PostgREST (Supabase's API layer) to reload its schema cache so the new
-- column is usable immediately, without waiting for a restart.
notify pgrst, 'reload schema';
