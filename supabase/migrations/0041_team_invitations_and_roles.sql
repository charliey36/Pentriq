-- Migration 0041: team invitations and role-aware access to the business row.
--
-- 1. team_invitations: pending/accepted/revoked invitations. Only the SHA-256 hash of the token is stored.
--    RLS is on with no policies, so only the service role (server code) can read or write it.
-- 2. One business per person: business_members.user_id becomes unique (the app already assumes this when it
--    loads "the" membership for a user; this makes the database enforce it).
-- 3. The old "Owner can manage own business" policy let ONLY the owner update the business row (its WITH CHECK
--    required owner_id = auth.uid()), so an admin teammate's settings saves would silently match zero rows.
--    Replaced with: any member may read; owner or admin may update; only a user creating their own row may insert.
--    Billing/ownership columns and deletes stay protected by the trigger from migration 0026.
-- Additive and safe to re-run.

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'staff')),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists team_invitations_business_idx on public.team_invitations (business_id, created_at desc);
create unique index if not exists team_invitations_one_pending_per_email_idx
  on public.team_invitations (business_id, lower(email))
  where accepted_at is null and revoked_at is null;
alter table public.team_invitations enable row level security;

create unique index if not exists business_members_one_business_per_user_idx on public.business_members (user_id);

drop policy if exists "Owner can manage own business" on public.businesses;
drop policy if exists "Member can view own business" on public.businesses;
drop policy if exists "Owner or admin can update business" on public.businesses;
drop policy if exists "User can create own business" on public.businesses;

create policy "Member can view own business" on public.businesses
  for select
  using (id in (select business_id from public.business_members where user_id = auth.uid()));

create policy "Owner or admin can update business" on public.businesses
  for update
  using (id in (select business_id from public.business_members where user_id = auth.uid() and role in ('owner', 'admin')))
  with check (id in (select business_id from public.business_members where user_id = auth.uid() and role in ('owner', 'admin')));

create policy "User can create own business" on public.businesses
  for insert
  with check (owner_id = auth.uid());

notify pgrst, 'reload schema';
