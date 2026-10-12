-- Migration: changelog + weekly "What's New" digest.
-- RLS is on with no policies: only the server (service role) reads or writes these tables.
-- `published` = the entry has gone out in a weekly digest, or was published by hand;
-- only published entries appear on /changelog. Safe to re-run.

create table if not exists public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  tag text not null default 'New' check (tag in ('New', 'Improved', 'Infrastructure')),
  entry_date date not null default current_date,
  published boolean not null default false,
  published_at timestamptz,
  digest_week date, -- Monday of the digest this entry was published in (null if published by hand)
  created_at timestamptz not null default now()
);
create index if not exists changelog_entries_published_idx on public.changelog_entries (published, entry_date desc);

create table if not exists public.changelog_digests (
  id uuid primary key default gen_random_uuid(),
  week_of date not null unique, -- Monday the digest was published
  summary text not null,
  created_at timestamptz not null default now()
);

alter table public.changelog_entries enable row level security;
alter table public.changelog_digests enable row level security;

-- Carry over the entries that used to live in src/content/changelog.ts (published).
insert into public.changelog_entries (title, description, tag, entry_date, published, published_at)
select v.title, v.description, v.tag, v.entry_date::date, true, now()
from (values
  ('Blog launched', 'Practical guides on Google reviews, Google Business Profile, customer feedback and reputation management, with a searchable index and categories.', 'New', '2026-10-12'),
  ('Google Search Console setup', 'pentriq.cloud is verified with Google Search Console, with a valid sitemap, robots.txt, canonical URLs and structured data.', 'Infrastructure', '2026-10-12'),
  ('Stripe billing integration', 'Subscribe through Stripe Checkout, manage your card, invoices and cancellation in the Stripe customer portal, and see your plan, next payment date and recent invoices on the Billing page.', 'New', '2026-10-11'),
  ('Custom domain migration to pentriq.cloud', 'Pentriq now lives at pentriq.cloud. Links in emails, review requests and the app use the new domain, and the www address redirects to it.', 'Infrastructure', '2026-10-11'),
  ('Review analytics improvements', 'Tabbed Reviews Analytics with review count, average rating, rating change since last month, review velocity and plain-English insights, with manual reputation tracking that works without a Google connection.', 'Improved', '2026-10-10')
) as v(title, description, tag, entry_date)
where not exists (select 1 from public.changelog_entries);

notify pgrst, 'reload schema';
