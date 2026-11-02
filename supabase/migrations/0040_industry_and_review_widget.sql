-- Migration 0040: industry preset + opt-in public review widget.
-- industry: slug from src/lib/industries.ts chosen during onboarding (used for presets and analytics).
-- widget_enabled: when true, /widget/<business id> publicly shows the business's recent 4-5 star Google
-- reviews (already public on Google) for embedding on the business's own website. Off by default.
-- Additive and safe to re-run.

alter table public.businesses add column if not exists industry text;
alter table public.businesses add column if not exists widget_enabled boolean not null default false;

notify pgrst, 'reload schema';
