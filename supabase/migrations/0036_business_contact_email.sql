-- Optional business contact email, shown as "Need help?" in customer-facing emails.
-- Null/blank = the support section is not rendered. Additive and safe to re-run.
alter table public.businesses add column if not exists contact_email text;
notify pgrst, 'reload schema';
