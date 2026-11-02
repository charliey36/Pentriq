-- Migration 0042: composite indexes for the hottest per-business query shapes.
--
-- Each index below matches a query that exists in the code today (single-column business_id indexes force a
-- sort or a wide scan once a business has thousands of rows):
--   customers (business_id, created_at desc)       customers list, newest first (customers/page.tsx)
--   visits    (business_id, visited_at desc)       analytics / segments / health scoring windows
--   messages  (business_id, purpose, status, created_at desc)
--                                                  "latest review request per customer" (customers/page.tsx)
--   click_events (business_id, clicked_at desc)    click analytics windows (click-analytics.ts)
-- Expected effect is fewer sorts and index-only range scans; it has not been benchmarked against production data.
-- Additive and safe to re-run. (On a very large live table, create these CONCURRENTLY from the SQL editor instead.)

create index if not exists customers_business_created_idx on public.customers (business_id, created_at desc);
create index if not exists visits_business_visited_idx on public.visits (business_id, visited_at desc);
create index if not exists messages_business_purpose_status_created_idx on public.messages (business_id, purpose, status, created_at desc);
create index if not exists click_events_business_clicked_idx on public.click_events (business_id, clicked_at desc);

notify pgrst, 'reload schema';
