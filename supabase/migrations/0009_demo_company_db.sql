-- DEMO ONLY: simulates a company's own job/booking database that Pentriq
-- syncs from. Add a row in the Supabase Table Editor; the sync imports it.
--
-- Originally business_id defaulted to one specific test organisation and the
-- sample rows were inserted unconditionally, which made this migration fail
-- on every fresh database (that organisation only exists in the original
-- project) and meant any insert without a business_id silently landed in that
-- one tenant. The default is no longer created here (0045 drops it from
-- databases that already have it) and the sample rows are only added where
-- that organisation exists.
create table if not exists public.demo_company_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_name text not null,
  email text not null,
  phone text,
  amount_spent numeric not null default 0,
  service_date date not null default current_date,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);
alter table public.demo_company_records enable row level security; -- server-only

-- Sample rows (appear in Pentriq after the first sync). Only for the original test organisation, and only once.
insert into public.demo_company_records (business_id, customer_name, email, phone, amount_spent, service_date)
select b.id, v.customer_name, v.email, v.phone, v.amount_spent, v.service_date
from public.businesses b
cross join (values
  ('Alice Walker', 'alice.walker@example.com', '07700900001', 120::numeric, current_date - 2),
  ('Bob Henderson', 'bob.henderson@example.com', '07700900002', 85.5::numeric, current_date - 10)
) as v(customer_name, email, phone, amount_spent, service_date)
where b.id = '0b057a54-9825-4707-acb1-783b69224622'
  and not exists (
    select 1 from public.demo_company_records d where d.business_id = b.id and d.email = v.email
  );
