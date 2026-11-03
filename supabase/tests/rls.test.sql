-- Row-level security and privilege tests, run by scripts/verify-db.sh after every migration has been applied.
--
-- Everything runs in one transaction that is rolled back, so the database is left exactly as it was.
-- Each check switches to a real Postgres role (anon / authenticated / service_role) with real JWT claims, the
-- same way PostgREST does for a browser request, and asserts what that caller can see and change.
-- A failed check raises an exception and stops the run (ON_ERROR_STOP).

begin;

create schema rls_test;
grant usage on schema rls_test to anon, authenticated, service_role;

create function rls_test.check(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'RLS TEST FAILED: %', label;
  end if;
end $$;
grant execute on function rls_test.check(boolean, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------
-- Fixtures: business A (owner, admin, staff) and business B (owner), as the service would create them.
-- ---------------------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner-b@test.invalid'),
  ('00000000-0000-0000-0000-0000000000c1', 'nobody@test.invalid');

insert into public.businesses (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'Beta');

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'staff'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'owner');

insert into public.customers (id, business_id, name, email) values
  ('cccccccc-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ann', 'ann@test.invalid'),
  ('cccccccc-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', 'Al', 'al@test.invalid'),
  ('cccccccc-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000001', 'Bea', 'bea@test.invalid');

insert into public.services (business_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Cut'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Colour');
insert into public.loyalty_programs (business_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000001');
insert into public.referral_promotions (business_id, name, customer_reward, referrer_reward) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Spring', '10% off', '10% off');
insert into public.journeys (business_id, key, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'review_sequence', 'Reviews'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'review_sequence', 'Reviews');
insert into public.private_feedback (business_id, customer_id, comment) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000a1', 'Lovely'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000b1', 'Great');
insert into public.segments (business_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'VIPs');
insert into public.visits (business_id, customer_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000a1');
insert into public.messages (business_id, customer_id, purpose, send_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000a1', 'review_request', now());
insert into public.team_invitations (business_id, email, role, token_hash, expires_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'new@test.invalid', 'staff', 'hash-1', now() + interval '7 days');
insert into public.webhook_endpoints (business_id, url, secret_encrypted) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'https://hooks.test.invalid/in', 'encrypted');
insert into public.saved_views (business_id, scope, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'customers', 'Failed');
insert into public.api_keys (business_id, key_hash, key_prefix) values ('aaaaaaaa-0000-0000-0000-000000000001', 'hash', 'pk_');
insert into public.audit_log (business_id, action) values ('aaaaaaaa-0000-0000-0000-000000000001', 'team.invited');

-- ---------------------------------------------------------------------------------------------------------
-- Structural guarantees
-- ---------------------------------------------------------------------------------------------------------
select rls_test.check(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  'every table in schema public has row-level security enabled'
);
select rls_test.check(not has_function_privilege('anon', 'public.rate_limit_hit(text,integer,integer)', 'execute'), 'anon cannot call rate_limit_hit');
select rls_test.check(not has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer)', 'execute'), 'authenticated cannot call rate_limit_hit');
select rls_test.check(has_function_privilege('service_role', 'public.rate_limit_hit(text,integer,integer)', 'execute'), 'service_role can call rate_limit_hit');
select rls_test.check(not has_function_privilege('anon', 'public.import_apply_visits(uuid,jsonb)', 'execute'), 'anon cannot call import_apply_visits');
select rls_test.check(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
  ),
  'no SECURITY DEFINER function in schema public is callable by anon'
);
select rls_test.check(not has_function_privilege('authenticated', 'public.rls_status()', 'execute'), 'only the service role can call rls_status');
select rls_test.check(has_function_privilege('service_role', 'public.rls_status()', 'execute'), 'service role can call rls_status');
select rls_test.check(not exists (select 1 from public.rls_status() where not rls_enabled), 'rls_status reports every table protected');
select rls_test.check(exists (select 1 from public.schema_migrations where version = '0045'), 'migration ledger records 0045');

-- ---------------------------------------------------------------------------------------------------------
-- Anonymous visitor (anon key, no session)
-- ---------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select rls_test.check((select count(*) from public.customers) = 0, 'anon sees no customers');
select rls_test.check((select count(*) from public.businesses) = 0, 'anon sees no businesses');
select rls_test.check((select count(*) from public.private_feedback) = 0, 'anon sees no private feedback');
do $$ begin
  insert into public.customers (business_id, name, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'X', 'x@test.invalid');
  raise exception 'RLS TEST FAILED: anon inserted a customer';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Signed-in user who belongs to no business
-- ---------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select rls_test.check((select count(*) from public.customers) = 0, 'non-member sees no customers');
select rls_test.check((select count(*) from public.businesses) = 0, 'non-member sees no businesses');
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Owner of business B looking at business A (cross-tenant isolation)
-- ---------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select rls_test.check((select count(*) from public.customers) = 1, 'B owner sees only B customers');
select rls_test.check((select count(*) from public.customers where business_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'B owner cannot read A customers');
select rls_test.check((select count(*) from public.businesses) = 1, 'B owner sees only own business');
select rls_test.check((select count(*) from public.private_feedback where business_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'B owner cannot read A feedback');
select rls_test.check((select count(*) from public.messages where business_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'B owner cannot read A messages');
select rls_test.check((select count(*) from public.visits where business_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'B owner cannot read A visits');
select rls_test.check((select count(*) from public.segments where business_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'B owner cannot read A segments');
select rls_test.check((select count(*) from public.business_members where business_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'B owner cannot list A members');
with changed as (update public.customers set name = 'hacked' where business_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select rls_test.check((select count(*) from changed) = 0, 'B owner cannot update A customers');
with removed as (delete from public.customers where business_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select rls_test.check((select count(*) from removed) = 0, 'B owner cannot delete A customers');
with changed as (update public.businesses set name = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select rls_test.check((select count(*) from changed) = 0, 'B owner cannot update business A');
do $$ begin
  insert into public.customers (business_id, name, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'X', 'x@test.invalid');
  raise exception 'RLS TEST FAILED: B owner inserted a customer into A';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.business_members (business_id, user_id, role) values ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'owner');
  raise exception 'RLS TEST FAILED: B owner added themselves to A';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.import_apply_visits('aaaaaaaa-0000-0000-0000-000000000001', '[{"customer_id":"cccccccc-0000-0000-0000-0000000000a1","visited_at":"2026-01-01T10:00:00Z","price":"10"}]'::jsonb);
  raise exception 'RLS TEST FAILED: B owner imported visits into A';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('business-logos', 'aaaaaaaa-0000-0000-0000-000000000001/logo.png');
  raise exception 'RLS TEST FAILED: B owner uploaded a logo into A';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Staff member of A: works with customers, cannot change configuration (migration 0044)
-- ---------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
select rls_test.check((select count(*) from public.customers) = 2, 'staff sees A customers only');
insert into public.customers (business_id, name, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'New', 'new-customer@test.invalid');
insert into public.services (business_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Imported service');
with changed as (update public.services set name = 'renamed' returning 1)
select rls_test.check((select count(*) from changed) = 0, 'staff cannot update services');
with removed as (delete from public.services returning 1)
select rls_test.check((select count(*) from removed) = 0, 'staff cannot delete services');
with changed as (update public.loyalty_programs set points_per_visit = 999 returning 1)
select rls_test.check((select count(*) from changed) = 0, 'staff cannot change the loyalty programme');
with changed as (update public.journeys set is_active = false returning 1)
select rls_test.check((select count(*) from changed) = 0, 'staff cannot change journeys');
with removed as (delete from public.referral_promotions returning 1)
select rls_test.check((select count(*) from removed) = 0, 'staff cannot delete referral promotions');
do $$ begin
  insert into public.referral_promotions (business_id, name, customer_reward, referrer_reward)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Free', 'everything', 'everything');
  raise exception 'RLS TEST FAILED: staff created a referral promotion';
exception when insufficient_privilege then null;
end $$;
with changed as (update public.businesses set name = 'Staff rename' returning 1)
select rls_test.check((select count(*) from changed) = 0, 'staff cannot change business settings');
select rls_test.check((select count(*) from public.team_invitations) = 0, 'staff cannot read team invitations');
select rls_test.check((select count(*) from public.webhook_endpoints) = 0, 'staff cannot read webhook endpoints');
select rls_test.check((select count(*) from public.api_keys) = 0, 'staff cannot read API keys');
select rls_test.check((select count(*) from public.saved_views) = 0, 'saved views are server-only');
select rls_test.check((select count(*) from public.audit_log) = 0, 'audit log is server-only');
do $$ begin
  insert into public.audit_log (business_id, action) values ('aaaaaaaa-0000-0000-0000-000000000001', 'forged');
  raise exception 'RLS TEST FAILED: staff wrote to the audit log';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Admin of A: may change configuration, never billing or ownership
-- ---------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
with changed as (update public.services set name = 'Cut & finish' where name = 'Cut' returning 1)
select rls_test.check((select count(*) from changed) = 1, 'admin can update services');
with changed as (update public.loyalty_programs set points_per_visit = 20 returning 1)
select rls_test.check((select count(*) from changed) = 1, 'admin can change the loyalty programme');
with changed as (update public.journeys set is_active = true returning 1)
select rls_test.check((select count(*) from changed) = 1, 'admin can change journeys');
insert into public.referral_promotions (business_id, name, customer_reward, referrer_reward)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Summer', '5 off', '5 off');
with changed as (update public.businesses set name = 'Alpha Studio' returning 1)
select rls_test.check((select count(*) from changed) = 1, 'admin can change business settings');
do $$ begin
  update public.businesses set subscription_status = 'active' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'RLS TEST FAILED: admin changed the subscription status';
exception when insufficient_privilege then null;
end $$;
select rls_test.check((select count(*) from public.webhook_endpoints) = 0, 'webhook endpoints are server-only, even for admins');
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Owner of A: full configuration, but billing, ownership and deletion only through the server
-- ---------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  update public.businesses set stripe_subscription_id = 'sub_fake' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'RLS TEST FAILED: owner set a Stripe subscription id';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.businesses set owner_id = '00000000-0000-0000-0000-0000000000a3' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'RLS TEST FAILED: owner transferred ownership from the browser';
exception when insufficient_privilege then null;
end $$;
with removed as (delete from public.businesses where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select rls_test.check((select count(*) from removed) = 0, 'owner cannot delete the business from the browser');
with changed as (update public.businesses set require_mfa = true where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select rls_test.check((select count(*) from changed) = 1, 'owner can require two-factor authentication');
insert into storage.objects (bucket_id, name) values ('business-logos', 'aaaaaaaa-0000-0000-0000-000000000001/logo.png');
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- Right to erasure: deleting a customer (as the owner, through RLS) removes every record linked to them
-- ---------------------------------------------------------------------------------------------------------
insert into public.customer_tags (business_id, customer_id, tag) values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000a1', 'vip');
insert into public.loyalty_ledger_entries (business_id, customer_id, delta, reason) values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000a1', 10, 'visit');
insert into public.review_requests (business_id, customer_id, send_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000a1', now());
insert into public.interaction_events (business_id, customer_id, event_type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-0000000000a1', 'review_link_clicked');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
with removed as (delete from public.customers where id = 'cccccccc-0000-0000-0000-0000000000a1' returning 1)
select rls_test.check((select count(*) from removed) = 1, 'owner can erase a customer');
reset role;
select rls_test.check(
  (select count(*) from public.visits where customer_id = 'cccccccc-0000-0000-0000-0000000000a1')
  + (select count(*) from public.messages where customer_id = 'cccccccc-0000-0000-0000-0000000000a1')
  + (select count(*) from public.private_feedback where customer_id = 'cccccccc-0000-0000-0000-0000000000a1')
  + (select count(*) from public.customer_tags where customer_id = 'cccccccc-0000-0000-0000-0000000000a1')
  + (select count(*) from public.loyalty_ledger_entries where customer_id = 'cccccccc-0000-0000-0000-0000000000a1')
  + (select count(*) from public.review_requests where customer_id = 'cccccccc-0000-0000-0000-0000000000a1')
  + (select count(*) from public.interaction_events where customer_id = 'cccccccc-0000-0000-0000-0000000000a1') = 0,
  'erasing a customer removes their visits, messages, feedback, tags, loyalty, requests and clicks'
);

-- ---------------------------------------------------------------------------------------------------------
-- Service role (server code) bypasses RLS
-- ---------------------------------------------------------------------------------------------------------
set local role service_role;
select rls_test.check((select count(*) from public.customers) = 3, 'service role sees every tenant');
select rls_test.check((select count(*) from public.team_invitations) = 1, 'service role reads server-only tables');
reset role;

rollback;
