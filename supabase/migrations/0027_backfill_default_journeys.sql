-- Migration: give every existing business the default journeys it is missing.
--
-- New accounts are provisioned with these in code (src/lib/provision-business.ts).
-- Before that fix, journeys were only ever created by a one-off backfill, so any
-- business created after the backfill (for example the account created on
-- 2026-10-05) has none and sends a single review email instead of the advertised
-- request + day-3 + day-7 sequence. This adds only what is missing and never
-- touches existing journeys. Safe to re-run.

insert into public.journeys (business_id, key, name, steps)
select b.id, d.key, d.name, d.steps
from public.businesses b
cross join (values
  ('review_sequence',    'Review request sequence', '[{"wait_hours": 0, "channel": "email", "purpose": "review_request"}, {"wait_hours": 72, "channel": "email", "purpose": "review_reminder"}, {"wait_hours": 168, "channel": "email", "purpose": "review_reminder"}]'::jsonb),
  ('rebooking_reminder', 'Rebooking reminder',      '[{"wait_hours": 0, "channel": "email", "purpose": "rebooking_reminder"}]'::jsonb),
  ('win_back',           'Win-back campaign',       '[{"wait_hours": 0, "channel": "email", "purpose": "win_back"}]'::jsonb),
  ('birthday',           'Birthday campaign',       '[{"wait_hours": 0, "channel": "email", "purpose": "birthday"}]'::jsonb)
) as d(key, name, steps)
on conflict (business_id, key) do nothing;
