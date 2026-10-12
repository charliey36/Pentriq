-- Migration: record that the business confirmed it may contact a customer.
--
-- Pentriq sends email on the business's behalf, so the business is responsible
-- for having a lawful basis to contact each customer (UK GDPR / PECR). When a
-- customer is added by hand, via CSV import or during onboarding, the owner
-- must tick a confirmation, and the time is stored here as a record.
-- Existing customers stay NULL: we do not claim consent that was never recorded.
-- Safe to re-run.

alter table public.customers
  add column if not exists consent_confirmed_at timestamptz;

notify pgrst, 'reload schema';
