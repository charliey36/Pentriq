# Pentriq

Pentriq is an AI-powered reputation management platform helping businesses collect, monitor, analyse and improve customer reviews, with retention and rebooking workflows built in.

Built with:

- Next.js 14
- TypeScript
- Supabase
- PostgreSQL
- Tailwind CSS
- Vercel

Key functionality includes:

- Automated review requests
- Customer rebooking reminders
- Loyalty programmes
- Referral tracking
- Customer segmentation
- Retention campaigns
- Analytics and reporting

Status: Active development.





# Detailed Technical Documentation

A platform for service businesses to automate review requests, rebooking
reminders, and customer retention (loyalty, referrals, win-back campaigns),
built on top of a channel-agnostic messaging engine and a small journey
scheduler.

**This started as a minimal prototype and has grown into a fuller platform,
but is still not a hardened production application.** Several integration
points (SMS/WhatsApp delivery, AI-drafted copy, real-time booking) are
implemented as clean, swappable interfaces with a working fallback rather
than live third-party integrations, since this environment has no real
Twilio/LLM credentials to build and test against — see "Integration points
that need real credentials" below for exactly what to wire up.

## Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [Supabase](https://supabase.com/) (Postgres + Auth, Row Level Security)
- [Tailwind CSS](https://tailwindcss.com/)
- [Resend](https://resend.com/) for sending email

## Features

### Review collection
- Email/password auth (Supabase Auth), with team support: a business can
  have more than one user via the `business_members` table (no UI to invite
  teammates yet, but the schema and RLS model support it).
- Settings: business name, Google review URL, send delay.
- Customers: add name + email + phone, or **bulk CSV import** (name/email
  columns, dedup against existing customers, per-row error reporting).
- **Multi-touch review request sequence**: every new customer is enrolled
  in a 3-step journey (initial request, day-3 reminder, day-7 final
  reminder) that stops automatically as soon as the customer clicks or
  submits feedback — not just a single one-shot email.
- **Compliant private feedback channel**: every review request shows a
  public review link *and* an unconditional private feedback option,
  never gated by predicted sentiment — see
  [`src/lib/compliance.ts`](./src/lib/compliance.ts) for the enforced
  invariant and why (FTC 16 CFR Part 465 / Google review-gating policy).
  Feedback submitted privately shows up in the **Feedback inbox** page for
  the business to acknowledge/resolve.
- **Channel-agnostic messaging**: email is fully wired via Resend; SMS/
  WhatsApp are structurally complete (template rendering, retry, consent)
  but send through a logging stub until real provider credentials are
  configured — see "Integration points" below.
- Automatic retry with exponential backoff (5 min → 30 min → 2h → 6h, up to
  5 attempts) on any failed send, instead of failing permanently on the
  first error.
- Unsubscribe link in every email (CAN-SPAM compliance); stops all future
  sends to that customer and cancels anything already scheduled.

### Rebooking
- **Service catalog** (Settings → Services): name, typical rebooking
  interval in days, default price.
- **Customer detail page**: lifetime value, next-expected-visit date,
  due/lapsed badges, tag editor, loyalty points balance, visit log with a
  "log a visit" form (service + price + notes).
- **Automated rebooking reminders**: a daily job scans every customer's
  visit history against their service's rebooking interval and enrolls
  due customers into a rebooking-reminder journey, and lapsed customers
  (2x the interval with no return visit) into a win-back journey.
- **Rebooking request page** (`/book/[customerId]`): captures a customer's
  preferred time as a note for the business to confirm manually. This is
  *not* a real-time booking engine with live availability — building one
  requires either a native slot-scheduling system or an integration with
  whatever calendar tool the business already uses, which the spec this
  was built from explicitly calls out as a decision to validate with real
  customers first rather than assume.

### Retention
- **Segments** (`/segments`): dynamic customer segments (e.g. "60+ days
  since last visit AND lifetime value over $200"), evaluated live from
  visit/spend/tag data rather than a static list that goes stale.
- **Loyalty program** (Settings → Loyalty): points per visit/review/
  referral, configurable redemption threshold and reward description.
  Points are an append-only ledger (never a mutable balance field), shown
  on each customer's detail page.
- **Referrals** (`/referrals`): generate a code for an existing customer,
  redeem it against a new customer; both get rewarded with loyalty points
  (if the program is active) once redeemed.
- **Win-back and birthday campaigns**: the same daily lifecycle scan that
  drives rebooking reminders also enrolls lapsed customers into a win-back
  journey and birthday-matched customers into a birthday journey.

### Analytics
- **Dashboard**: customers added, emails sent, link clicks, and the actual
  click-through rate (not just raw counts), plus pending/failed visibility.
- **Analytics page** (`/analytics`): 30-day rebooking rate, revenue
  attributed to rebooking-reminder clicks (last-touch, 7-day window), and
  a customer health-tier distribution (thriving/steady/at-risk/lapsed)
  computed from a simple, explainable recency/frequency/monetary blend —
  see [`src/lib/health.ts`](./src/lib/health.ts).
- Admin view: if you log in with an email listed in `ADMIN_EMAIL`, your
  dashboard also shows a table of every registered business.

### AI (hooks, not live calls)
- [`src/lib/ai.ts`](./src/lib/ai.ts) has a `draftMessageCopy()` function
  that would call an LLM if `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set,
  and otherwise falls back to a deterministic template-based draft. No
  real LLM call is implemented (no credentials to test against) — the
  integration point is ready for a one-function addition once a provider
  is chosen.

## Integration points that need real credentials

These are built as clean, swappable interfaces with a working, honest
fallback — not left out, but not fake either:

| Feature | File | Current behavior | To go live |
| --- | --- | --- | --- |
| SMS / WhatsApp sending | [`src/lib/messaging.ts`](./src/lib/messaging.ts) | Logs the message server-side instead of delivering it (`LoggingStubSmsProvider`) | Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, then implement the real Twilio REST call in `createSmsProvider()` — everything else (templates, retry, consent, resolveChannel) already works against the interface |
| AI-drafted message copy | [`src/lib/ai.ts`](./src/lib/ai.ts) | Falls back to a template-based draft | Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, then implement the completion call in `draftMessageCopy()` |
| One-click rebooking with live availability | [`src/app/book/[customerId]`](./src/app/book/[customerId]) | Captures a preferred-time request as a note for manual follow-up | Either build a native slot-availability engine or integrate with the business's existing calendar/scheduling tool — see the comment in `actions.ts` |

## 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com/).
2. In the SQL editor, run the full contents of
   [`supabase/schema.sql`](./supabase/schema.sql). This creates every table
   (businesses, business_members, customers, customer_tags, services,
   visits, messages, interaction_events, private_feedback, journeys,
   journey_enrollments, segments, loyalty_programs, loyalty_ledger_entries,
   referrals, import_jobs, plus the original review_requests/click_events)
   along with Row Level Security policies, and backfills `business_members`
   + default journeys for any businesses that already exist.
   - `schema.sql` is idempotent (`create table if not exists`, `drop
     policy if exists` + `create policy`) — safe to run again on a
     database that already has some of these tables. **Caveat:** this
     idempotency only applies to whole tables. If a table already exists,
     `create table if not exists` does not add any new columns to it, even
     ones listed in the statement — this caused a production incident
     where `customers.phone` (among other columns) was never created
     because `customers` pre-dated this schema version. Columns added to
     an already-existing table must ship as a separate `alter table ...
     add column if not exists` migration (see 0003 below), not just be
     added to this file's `create table` statement.
   - If you're upgrading from a database older than this version, run, in
     order: [`supabase/migrations/0001_retry_and_consent.sql`](./supabase/migrations/0001_retry_and_consent.sql),
     then `schema.sql` in full (see
     [`supabase/migrations/0002_platform.sql`](./supabase/migrations/0002_platform.sql)
     for why there's no separate incremental SQL file for this step), then
     [`supabase/migrations/0003_fix_missing_columns.sql`](./supabase/migrations/0003_fix_missing_columns.sql)
     (adds columns that step 2 silently skips on tables that pre-date this
     schema version — safe/required even if you believe you already ran
     the full schema), then
     [`supabase/migrations/0004_business_logo_storage.sql`](./supabase/migrations/0004_business_logo_storage.sql)
     (creates the public `business-logos` Storage bucket and its RLS
     policies, used by the profile picture uploader in Settings).
   - **Migrations 0005–0026 are also required** for the current app. Apply
     every file in `supabase/migrations/` in numeric order. Recent ones to be
     aware of: `0023` makes the free trial opt-in (existing accounts are
     grandfathered), `0024` adds the rate limiter used by the public
     unsubscribe/feedback/booking endpoints, `0025` records customer
     consent, and `0026` stops signed-in users editing their own billing
     fields or deleting their business from the browser. Deploy the code only after applying them. In particular,
     [`0017_ensure_business_settings_columns.sql`](./supabase/migrations/0017_ensure_business_settings_columns.sql)
     guarantees the columns the Settings page saves
     (`review_request_window_days`, `rebooking_reminder_interval_days`,
     `rebooking_reminders_enabled`) exist and reloads the PostgREST schema
     cache (`notify pgrst, 'reload schema'`). If Settings fails to save with
     *"Could not find the '…' column of 'businesses' in the schema cache"*,
     run it in the Supabase SQL editor; the app also logs this at startup
     (`DATABASE SCHEMA VALIDATION FAILED`).
3. From Project Settings → API, copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

## 2. Create a Resend account (for sending email)

1. Sign up at [resend.com](https://resend.com/) and create an API key.
2. For a quick demo you can send from `onboarding@resend.dev` (Resend's
   shared sandbox sender) without verifying a domain. For anything beyond a
   demo, verify your own sending domain in Resend and set `EMAIL_FROM`
   accordingly.

## 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — **server-only**, never expose to the browser |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender address (or `onboarding@resend.dev` for a demo) |
| `NEXT_PUBLIC_APP_URL` | Public URL of this app, used to build tracking/unsubscribe/feedback/booking links (e.g. `http://localhost:3000` locally) |
| `CRON_SECRET` | Random secret required to call any `/api/*` scheduled-job endpoint |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional — OAuth client for the Google Business Profile integration (see section 9) |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Required with the above — 32-byte key (`openssl rand -base64 32`) used to encrypt stored Google tokens. **Server-only; losing it means users must reconnect.** |
| `GOOGLE_BUSINESS_API_APPROVED` | Set to `true` once Google approves Business Profile API access; until then the Google card shows "Integration Coming Soon" |
| `GOOGLE_REDIRECT_URI` | Optional — defaults to `NEXT_PUBLIC_APP_URL` + `/api/google-business/callback` |
| `ADMIN_EMAIL` | If your logged-in email matches this, your dashboard also shows every registered business. Comma-separate multiple emails for more than one admin. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Optional — enables real SMS/WhatsApp sending once implemented in `lib/messaging.ts` (see Integration points above). Without these, SMS/WhatsApp sends are logged, not delivered. |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Optional — Sentry error monitoring (server and browser). Same DSN in both. Blank = off. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Optional, build-time — upload source maps and create a release per deploy (release = Git commit). |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Optional — enables real AI-drafted message copy once implemented in `lib/ai.ts`. Without these, drafting falls back to templates. |

## 4. Install and run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`, sign up, and you'll land on the dashboard.

### Or run it with Docker

```bash
ln -sf .env.local .env   # one-time: lets docker compose read your env vars
docker compose up
```

Visit `http://localhost:3000`. The symlink is needed because Docker Compose
only reads a plain `.env` file (not `.env.local`) to fill in `${...}`
placeholders used for build-time variables. Rebuild after changing
dependencies or `NEXT_PUBLIC_*` vars with `docker compose up --build`.

If you hit a TLS/certificate error inside the container (`unable to get
local issuer certificate`) but everything works fine outside Docker, your
network likely runs a corporate TLS-inspecting proxy (e.g. Zscaler) whose
root CA is trusted on your host machine but unknown to a fresh container.
See the comments in [`Dockerfile`](./Dockerfile).

## 5. Seed demo data (optional)

```bash
npm run seed
```

Creates a demo business, its `business_members` row, and five sample
customers (mix of pending/sent review requests, one already clicked).

Demo login: `demo@pentriq.app` / `demo-password-123` by default —
override with `SEED_DEMO_EMAIL` / `SEED_DEMO_PASSWORD` env vars.

## 6. Scheduled jobs

Nothing sends automatically on a timer inside the Next.js app — external
schedulers must hit these endpoints on an interval. All are protected by
`CRON_SECRET` (as `?secret=...` or `Authorization: Bearer ...`):

| Endpoint | What it does | Suggested interval |
| --- | --- | --- |
| `GET /api/send-review-requests` | Legacy single-send review request flow (the original `review_requests` table) | Every 5 min |
| `GET /api/send-messages` | Processes the generalized `messages` table — review sequence follow-ups, rebooking reminders, win-back, birthday, referral, loyalty messages | Every 5 min |
| `GET /api/scan-customer-lifecycle` | Daily scan: enrolls due customers into rebooking reminders, lapsed customers into win-back, birthday matches into birthday campaigns | Daily |
| `GET /api/sync-google-reviews` | Syncs Google reviews for every connected business, stores the daily snapshot and raises alerts (section 9) | Daily on Vercel Hobby (every 6 hours on Pro or an external scheduler) |

Locally:

```bash
curl "http://localhost:3000/api/send-messages?secret=YOUR_CRON_SECRET"
```

In production, use [Vercel Cron](./vercel.json) (set `CRON_SECRET` in Vercel and it
sends `Authorization: Bearer <CRON_SECRET>` automatically; no secret goes in `vercel.json`) or any external
scheduler (e.g. [cron-job.org](https://cron-job.org/), a GitHub Actions
scheduled workflow) hitting the same URLs.

## 7. Click tracking, feedback, and unsubscribe

- **Review links are tracked.** Every review request/reminder email links to
  `{NEXT_PUBLIC_APP_URL}/r/{tracking_token}` (never straight to Google). The
  endpoint ([`src/app/r/[token]/route.ts`](./src/app/r/[token]/route.ts),
  logic in [`src/lib/click-tracking.ts`](./src/lib/click-tracking.ts)):
  1. looks up the send (`messages`, or legacy `review_requests`) by its
     unguessable `tracking_token`;
  2. classifies the hit — email security scanners, link previews, prefetch,
     HEAD probes, known bot user agents and "clicked within 3 s of sending"
     are logged as `review_link_scan` and **not counted**, and never cancel
     follow-up reminders;
  3. records a `review_link_clicked` row in `interaction_events` (message /
     review request id, customer id, campaign (journey) id, timestamp, user
     agent, **anonymised** IP — last IPv4 octet dropped / IPv6 cut to /48 —
     and the destination URL) and updates `click_count`, `first_clicked_at`,
     `last_clicked_at`, `destination_url` on the send;
  4. ignores an immediate repeat click (30 s) from the same visitor, so
     double-clicks and prefetch+click count once while genuine return visits
     count again;
  5. exits the journey enrollment (stops reminder steps) on a genuine click;
  6. `302`s to the business's review URL (or the branded
     `/review-unavailable` page if none is set). The redirect always happens,
     even if recording fails.
- Emails sent before this change keep working: `/api/track/[reviewRequestId]`
  and `/api/track-message/[messageId]` are still served and share the same
  handler. If migration 0018 hasn't been applied yet, links fall back to the
  row id and clicks fall back to the older table shapes, so nothing breaks —
  but run the migration to get per-send counters.
- **Where clicks show up**: the Dashboard (clicks, click-through rate, a
  Sent → Delivered → Opened → Clicked → Reviews received funnel, activity
  chart) and the Analytics page (totals, campaign performance per sequence
  step, recent clicks). CTR = counted clicks ÷ delivered emails × 100.
  - *Delivered* currently equals *Sent* (accepted by Resend): no delivery
    webhook is wired up. *Opened* is not tracked and shown as such.
    *Reviews received* counts `review_confirmed` events. Real Google review
    data comes from the Google Business Profile integration (section 9) and is
    shown on the **Reviews Analytics** page.
- `/feedback/[messageId]` is the public private-feedback landing page
  linked from every review request.
- `/api/unsubscribe/[customerId]` stops all future emails to a customer.

## 8. Admin view

If you log in with the email set as `ADMIN_EMAIL`, your dashboard also
shows a table of every business that has signed up. Comma-separate
multiple addresses to grant more than one account admin access.

## 9. Google Business Profile (Reviews Analytics)

Users connect their Google account with OAuth (no review URL is typed anywhere),
pick a location, and Pentriq imports and tracks the location's reviews.

**User flow:** Settings → Integrations → *Connect Google Business* → Google
consent → choose a location → *Save location & import reviews* (the initial
sync runs immediately) → **Reviews Analytics** in the sidebar.

### One-time setup

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project
   and an **OAuth 2.0 Client ID** of type *Web application*. Add
   `{NEXT_PUBLIC_APP_URL}/api/google-business/callback` as an authorised
   redirect URI (and `http://localhost:3000/api/google-business/callback` for
   local dev). Configure the OAuth consent screen with the scope
   `https://www.googleapis.com/auth/business.manage`.
2. Enable the Business Profile APIs on the project: *My Business Account
   Management API*, *My Business Business Information API* and the legacy
   *Google My Business API* (v4 — the only API that exposes reviews).
   **Google gates these behind an access request**
   ([prerequisites](https://developers.google.com/my-business/content/prereqs));
   until the project is approved, calls fail with 403/429 and Pentriq shows
   "Google rejected the Business Profile API request".
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
   `GOOGLE_TOKEN_ENCRYPTION_KEY` (see the env table) and apply migrations
   [`0019_google_business_profile.sql`](./supabase/migrations/0019_google_business_profile.sql) and
   [`0020_google_granted_scopes.sql`](./supabase/migrations/0020_google_granted_scopes.sql).
   **Local development:** the OAuth callback must return to the origin that started the flow. If
   `NEXT_PUBLIC_APP_URL` in `.env.local` is your production URL, also set
   `GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-business/callback` and register that exact URI
   in Google Cloud Console (the connect route refuses to start in development when they differ).
4. Make sure `CRON_SECRET` is set. `vercel.json` schedules
   `/api/sync-google-reviews` once a day (`0 6 * * *`), because **Vercel's Hobby plan
   only allows daily crons** and rejects the deployment otherwise. For the intended
   6-hour freshness, either upgrade to Pro and change the schedule to `0 */6 * * *`, or
   leave Vercel's daily run and add an external scheduler (e.g. cron-job.org) that calls
   `GET /api/sync-google-reviews` every 6 hours with the header `Authorization: Bearer <CRON_SECRET>`.
   Users can also press *Sync now* at any time.
5. **While the OAuth consent screen is in *Testing*, Google expires refresh tokens after 7 days**, so syncing
   breaks weekly. Publish the app (Audience → *In production*) for long-lived tokens; `business.manage` is a
   sensitive scope, so public users will see an "unverified app" warning until Google verifies the app.

**Troubleshooting.** Run `node --env-file=.env.local scripts/check-google-oauth.mjs`: it validates the env
vars, the client ID/secret, which redirect URIs Google has registered, and the database tables, without
needing a login. OAuth failures are logged as `[google-oauth] {json}` lines (no tokens, codes or secrets) in
your terminal / Vercel logs; the `event` field says where it failed (`state_check_failed`,
`token_exchange_failed`, `scope_missing`, `accounts_list_failed`, `token_refresh_failed`, `api_call_failed`).

### How it works

| Piece | Where |
| --- | --- |
| OAuth start / callback (CSRF `state` in an httpOnly cookie) | [`src/app/api/google-business/`](./src/app/api/google-business) |
| Location picker, sync now, disconnect, alert threshold | [`src/app/(app)/settings/integrations/`](./src/app/(app)/settings/integrations) |
| Google API client (accounts, locations, reviews, replies) | [`src/lib/google-business.ts`](./src/lib/google-business.ts) |
| Token encryption (AES-256-GCM) | [`src/lib/google-token-crypto.ts`](./src/lib/google-token-crypto.ts) |
| Sync engine (fetch → insert/update → stats → snapshot → alerts) | [`src/lib/google-review-sync.ts`](./src/lib/google-review-sync.ts) |
| Pure analytics (cards, series, insights, filters) | [`src/lib/google-review-analytics.ts`](./src/lib/google-review-analytics.ts) |
| Alert rules | [`src/lib/google-review-alerts.ts`](./src/lib/google-review-alerts.ts) |
| Scheduled job | [`src/app/api/sync-google-reviews/route.ts`](./src/app/api/sync-google-reviews/route.ts) |
| Reviews Analytics page (Recharts) | [`src/app/(app)/reviews/`](./src/app/(app)/reviews) |

**Tables** (migration 0019): `google_business_connections` (one per business;
OAuth tokens encrypted; RLS on with **no policies**, so only the server's
service role can read it), `google_reviews`, `review_metrics_daily` (one
snapshot per day: total, average, gained) and `review_alerts`. Reviews,
metrics and alerts are readable by business members through RLS; all writes
happen server-side.

**Sync behaviour.** The first sync pages through every review, prunes any that
no longer exist on Google, and backfills daily snapshots from review dates so
charts have history immediately. Later syncs (scheduled, or *Sync now*)
fetch reviews ordered by `updateTime` and stop once a page predates the last
sync (with a day of overlap), inserting new reviews and updating edited ones
and replies. Today's snapshot uses Google's own `averageRating` /
`totalReviewCount`. Dates are bucketed in Europe/London.

**Replies.** Replying posts to Google first and only then stores the text, so
the database never shows a reply that isn't live. Later syncs pull replies back
from Google, so edits made on Google also appear. Replies are limited to 4,096
characters.

**Alerts** (in-app, shown on the Reviews Analytics page with an unread badge in
the sidebar; 1-star, low-rating and month-over-month alerts are also emailed to
the owner):

1. New review (summarised into one alert when more than 5 arrive at once)
2. New 1-star review
3. Average rating crosses below the threshold (default 4.0, set in Settings →
   Integrations) — fires on the crossing, not on every sync
4. Average rating lower than at the end of last month — at most once per month

The first (historical) import never raises alerts. Alerts are de-duplicated by
`(business_id, dedupe_key)`, so re-running a sync is safe.

**Rating Change** = current overall average − overall average at the end of the
previous calendar month. The date filter (7/30/90 days, 12 months, custom)
scopes the rating-trend chart, rating distribution and review list; the
summary cards and monthly insights always describe the current month, and the
growth chart has its own period switcher (this month / 3 months / 12 months).

**Disconnecting** revokes the token at Google and deletes the connection and
all data synced from it (reviews, snapshots, alerts). Changing location replaces
the previous location's data.

**Limitations.** Requires approved Business Profile API access (see setup).
Reviews deleted on Google are only removed locally by a full re-import
(disconnect and reconnect, or change location). Review replies can be created
and edited from Pentriq but not deleted.

## 10. Reputation Tracking (works without Google)

Google's Business Profile API needs Google's approval, so reputation tracking also works manually:
**Settings → Reputation Tracking** lets an owner record the current review count and average rating on any
date. Snapshots can be edited, deleted and the analytics rebuilt from the same page.

- **Tables** (migration [`0021_reputation_tracking.sql`](./supabase/migrations/0021_reputation_tracking.sql)):
  `manual_review_snapshots`, `review_sources`, `review_metrics` (monthly roll-up rebuilt on every change) and,
  for Google, `google_business_locations` and `google_sync_jobs` (one row per sync run). The existing
  `review_alerts` table serves every source (a manual rating drop raises a `rating_decrease` alert).
- **One data shape.** [`reputation-data.ts`](./src/lib/reputation-data.ts) loads either Google's
  `review_metrics_daily` (once a synced location has data) or the manual snapshots as the same daily series, and
  [`reputation-metrics.ts`](./src/lib/reputation-metrics.ts) (pure, tested) computes gains, rating change,
  review velocity (daily pace vs last month), monthly series and the plain-English insights.
- **Reviews Analytics** (`/reviews`) has Analytics, Reviews, Insights, Alerts and Connections tabs. Individual
  reviews, the star distribution and replies appear only for Google data.
- **When Google approval arrives:** set `GOOGLE_BUSINESS_API_APPROVED=true`. Until then the Google card in
  Settings → Integrations shows "Integration Coming Soon" (an existing connection still shows its controls).
  Nothing else changes: after the first sync the dashboard switches to the live data automatically.

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import the project into Vercel.
3. Add all variables from `.env.example` in Project Settings → Environment
   Variables.
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL.
5. Deploy. Make sure `CRON_SECRET` is set so Vercel Cron can authenticate against the
   scheduled-job endpoints.

## Project structure

```
src/
  app/
    (app)/                     Authenticated shell: layout, nav, logout
      dashboard/                Funnel + conversion rate, pending/failed counts
      customers/                List, add, CSV import, [customerId] detail page
      segments/                 Dynamic segment builder
      referrals/                Generate + redeem referral codes
      feedback-inbox/           Private feedback inbox (acknowledge/resolve)
      analytics/                Rebooking rate, revenue attribution, health tiers
      reviews/                  Reviews Analytics: tabs, cards, Recharts charts, insights, alerts (manual or Google data)
      settings/                 Business settings, services catalog, loyalty program
    api/
      send-review-requests/     Legacy single-send scheduled job
      send-messages/            Generalized multi-purpose/multi-channel scheduled job
      scan-customer-lifecycle/  Daily rebooking/win-back/birthday enrollment scan
      google-business/          OAuth connect + callback for Google Business Profile
      sync-google-reviews/      Scheduled Google review sync (daily; see section 9)
      track/[id]/               Legacy click tracking + redirect
      track-message/[id]/       Generalized click tracking + redirect + journey exit
      unsubscribe/[customerId]/ Public unsubscribe endpoint
    book/[customerId]/          Public rebooking request landing page
    r/[token]/                  Public tracked review link: records click, redirects to Google
    feedback/[messageId]/       Public private feedback landing page
    auth/callback/, login/, signup/
  components/                   Shared UI (auth form, nav links, logo)
  lib/
    supabase/                   Browser / server / admin Supabase clients
    business.ts                 Loads (or lazily creates) the logged-in user's business + membership
    messaging.ts                Channel-agnostic send abstraction (email real, SMS/WhatsApp stubbed)
    templates.ts                Message copy per purpose/channel, compliance-enforced for review purposes
    compliance.ts               Enforces the "always offer both public + private" invariant
    journeys.ts                 Minimal journey engine (enroll/advance/exit)
    visits.ts                   Rebooking status + lifetime value calculations
    segments.ts                 Live segment rule evaluator
    health.ts                   Rebooking rate, revenue attribution, health scoring
    customers.ts                CSV parsing + bulk import
    ai.ts                       AI drafting hook (template fallback, provider-pluggable)
    database.types.ts           Hand-written types matching supabase/schema.sql
supabase/
  schema.sql                    Full table set + RLS policies (idempotent)
  migrations/                   Incremental SQL for upgrading existing databases
scripts/seed.mjs                Demo data seed script
Dockerfile, docker-compose.yml, docker/certs/  Optional Docker setup
```

## Known limitations (by design)

- SMS/WhatsApp sending is structurally complete but logs instead of
  delivering until real Twilio credentials are configured (see
  "Integration points" above).
- AI message drafting falls back to templates until a real LLM provider
  key is configured.
- Rebooking is "request + manual confirm," not real-time booking with live
  availability — see the note in `src/app/book/[customerId]/actions.ts`.
- Segmentation evaluates all customers in-memory per request — fine at SMB
  scale, would need a SQL-level query or materialized rollup at larger
  scale (see `src/lib/segments.ts`).
- Revenue attribution uses a simple last-touch, 7-day click-to-visit
  window — a reasonable estimate, not perfect ground truth.
- Customer health scoring is a simple, explainable recency/frequency/
  monetary heuristic, not a trained predictive model — deliberately, so
  the business owner can see *why* a customer is scored the way they are.
- Automated tests cover the pure logic, click tracking, imports and the Google review integration (`npm test`); there are no end-to-end browser tests.
- CSV import caps at 2,000 rows / 2MB per file.
- The scheduled job endpoints each process at most 50 due rows per run.
