-- Optional review request cooldown. Off by default, so existing businesses
-- behave exactly as before. Additive and safe to re-run.
alter table public.businesses add column if not exists review_cooldown_enabled boolean not null default false;
alter table public.businesses add column if not exists review_cooldown_days integer not null default 60;
alter table public.businesses drop constraint if exists businesses_review_cooldown_days_check;
alter table public.businesses add constraint businesses_review_cooldown_days_check check (review_cooldown_days between 1 and 365);
notify pgrst, 'reload schema';
