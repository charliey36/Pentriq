# Booking-system auto-import

Owners connect their booking system once (Settings → Integrations → Booking systems). A daily job
(`/api/sync-bookings`, 07:30 UTC, before the 08:00 review-request sender) and a "Sync now" button pull
appointments that have **finished**, and feed them through the same import as CSV uploads: customer matching,
duplicate skipping, opt-outs, frequency limit, review scheduling and staff/service personalisation.

The first sync after connecting looks back 60 days; later syncs resume from the last sync with a day of overlap.
Customers without an email address are skipped and counted.

## One-time setup per provider (you)

Apply `supabase/migrations/0038_booking_connections.sql`, set `GOOGLE_TOKEN_ENCRYPTION_KEY` (tokens are encrypted
with it) and, for each provider you want to offer, register an app and add its keys to the environment.
Redirect URL for every provider: `https://<your-domain>/api/booking/<provider>/callback`

| Provider | Where to register | Env vars | Scopes requested |
|---|---|---|---|
| Square Appointments | developer.squareup.com → Applications → OAuth | `SQUARE_CLIENT_ID`, `SQUARE_CLIENT_SECRET` (`SQUARE_ENV=sandbox` to test) | `APPOINTMENTS_READ APPOINTMENTS_ALL_READ CUSTOMERS_READ ITEMS_READ EMPLOYEES_READ` (read-only) |
| Acuity Scheduling | Acuity developer / OAuth2 application request | `ACUITY_CLIENT_ID`, `ACUITY_CLIENT_SECRET` | `api-v1` |
| Calendly | developer.calendly.com → OAuth applications | `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET` | default |

A provider with no keys is shown as "Not set up on this server".

## Status: needs checking against live sandboxes

The connectors were written from the providers' documented APIs and are covered by tests that use mocked
responses. They have **not** been run against real Square, Acuity or Calendly accounts. Before relying on them,
connect a sandbox/test account for each and confirm: the consent screen scopes, a first sync, a second sync (no
duplicates), and "Disconnect". Things most likely to need adjusting:

- Square: scope names (`APPOINTMENTS_ALL_READ`), bookings without a `customer_id`, and the catalog lookup used for service names.
- Acuity: OAuth app approval, and whether the appointments list needs `max` paging for very busy days (windows are 7 days, max 500).
- Calendly: only the connecting user's own meetings are read (not the whole organisation).

Not supported (no usable public API, or not yet built): Fresha, Booksy, Vagaro, Jobber, ServiceM8. Use the CSV import
or the API endpoint for those.
