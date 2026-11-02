# Pentriq product, technical and enterprise audit

Date: 2026-11-02. Method: repository-wide structural review (479 files, ~37k lines TS/TSX, 39 migrations), full read of the auth middleware, cron auth, API-key path, rate limiter, Stripe webhook and Google sync/metrics code, plus a typecheck and the full test suite. Code outside those paths was assessed from structure, README and prior audit reports, **not line by line**. Nothing was exercised against live Supabase, Stripe, Resend or Google, so UX and commercial scores are informed judgement, not measurement.

## 1. Executive summary

Pentriq is a review-collection and customer-retention product for UK small service businesses (salons, clinics, trades): consent-aware review requests, rebooking and win-back journeys, Google Business Profile sync, loyalty and referrals, booking-system import (Square, Acuity, Calendly), Stripe billing and an admin portal. It is a mature single-product SaaS, further along than its README ("minimal prototype") admits.

| Dimension | Score /10 | Basis |
|---|---|---|
| Product maturity | 7 | Broad, coherent feature set; SMS stubbed; no team UI |
| Commercial readiness (SMB) | 7 | Billing, trial, pause, onboarding, blog/SEO, calculators in place |
| Enterprise readiness | 3 | No SSO, audit log, roles UI, DPA tooling, data-residency story |
| Technical quality | 7 | Strict TS, clean typecheck, 580 tests, tenant scoping, safe-redirect, masked logging |
| Scalability | 5 | Serverless crons doing per-business loops; import capped at 2,000 rows; DB-backed rate limiter |
| UX | 6.5 | Polished components, command palette, checklist; not user-tested here |

## 2. Findings by priority

Effort: S ≤ 1 day, M ≤ 1 week, L > 1 week. "Impl." marks what this pass changed.

### Critical
| # | Finding | Value | Complexity / effort | Risk if ignored | Status |
|---|---|---|---|---|---|
| C1 | `/api/ai-test` and `/ai-test` were reachable by **any signed-in user** and call paid Gemini with an arbitrary prompt | Cost and abuse control | Low / S | Direct spend | **Impl.** admin-only in middleware; delete the route when no longer needed |
| C2 | Public `POST /api/integrations/service-completed` had no rate limit (key guessing, floods, DB load) | API security | Low / S | DoS, noisy tenant | **Impl.** 120/min/IP, 429 + `Retry-After`, tested |
| C3 | No CI: type or test regressions can reach production unnoticed | Quality gate | Low / S | Regressions | **Impl.** `.github/workflows/ci.yml` (tsc, tests, advisory `npm audit`) |
| C4 | Monthly metrics roll-up ignored the injected clock (`rebuildMetrics` used wall time). One test was failing because of it; in production it makes backfills and tests time-dependent | Correctness | Low / S | Wrong monthly periods in re-runs | **Impl.** `now` threaded through; suite green (580/580) |
| C5 | CSV import is not one DB transaction; a retry can double-count spend/visit totals (known from prior audit) | Data integrity | Med / M | Wrong LTV and segments | Open: move write phase to a Postgres RPC |
| C6 | No audit log and no team/role management UI (schema supports `business_members`) | Enterprise sales blocker | Med / M-L | Cannot sell to multi-user or regulated buyers | Open: needs product decision on roles |

### High
- H1 No enforcing CSP. **Impl. partially**: `Content-Security-Policy-Report-Only` added so violations can be observed against Stripe, Sentry and Google before enforcing. Effort S to promote.
- H2 SMS/WhatsApp are a logging stub (`LoggingStubSmsProvider`); the biggest gap against competitors for UK trades and salons. Needs Twilio credentials. Effort M.
- H3 Cron secret also accepted as `?secret=` (ends up in logs). Kept for existing external schedulers; remove once migrated. Effort S.
- H4 Per-business loops inside serverless cron invocations will hit time limits as tenants grow; move to a queue with per-business jobs. Effort L.
- H5 Import cap of 2,000 rows / 2 MB; larger customers need background import. Effort M.
- H6 Root directory holds ~20 stale fix/summary files (`URGENT_*`, `ROOT_CAUSE_*`, `IMPLEMENTATION_COMPLETE.txt`…). They confuse new developers and buyers in due diligence. Move to `docs/history/`. Effort S; not done here to avoid a noisy rename without sign-off.
- H7 README opens with "not a hardened production application"; update before external sale.

### Medium
- Admin gate relies on an email allow-list (`isAdminEmail`); move to a role claim.
- `rate_limit_hit` fails open by design (needed for unsubscribe); keep, but alert on repeated limiter errors.
- Webhook/booking-sync observability: add a status view for failed syncs per tenant.
- Reporting: exports exist (account export, CSV); add scheduled PDF/CSV reports per business and agency roll-ups.
- Accessibility: no automated a11y checks; add axe tests on the marketing and auth pages.
- Referral reward for the referred customer is recorded but not credited (prior audit item 6).

### Low
- Dark-mode and mobile polish pass; keyboard shortcut help; saved filters on the customers table; loyalty Save-button spinner.

## 3. Benchmark (scoped to what Pentriq is)
Pentriq is a vertical product, so Jira/Asana/Linear/ClickUp/Monday/Notion comparisons apply to platform traits, not features to copy.
- Workflow engine: journeys exist but are fixed templates; Monday and ServiceNow offer user-built automations. Opportunity: a visual journey editor as a premium tier.
- Roles and permissions: Salesforce/Jira-class RBAC, SSO/SCIM and audit trails are absent.
- Integrations: three booking systems plus Google; a Zapier/Make app and outbound webhooks would widen reach cheaply (inbound API key endpoint and OpenAPI spec already exist).
- Reporting: strong for its niche (click analytics, reputation trends, weekly summary); no cross-location or agency view.
- Where Pentriq already wins: consent and anti-review-gating compliance, UK defaults, low setup friction.

## 4. Implemented in this pass
| Change | Files | Reasoning / benefit |
|---|---|---|
| Admin-only Gemini test tool | `src/middleware.ts` | Closes a paid-API abuse path |
| Rate-limit integration API | `src/app/api/integrations/service-completed/route.ts`, `src/lib/rate-limit.ts` | Abuse and load protection |
| Injected clock in metrics rebuild | `src/lib/reputation-data.ts`, `src/lib/google-review-sync.ts` | Fixes failing test and time-dependent roll-ups |
| CSP report-only header | `next.config.mjs` | Safe first step to enforcing CSP |
| CI workflow | `.github/workflows/ci.yml` | Regression gate |
| New tests | `src/lib/__tests__/api-hardening.test.ts` | Covers 429 and 401 paths |

Verification: `npx tsc --noEmit` clean; `npm test` 50 suites, 580 tests pass. Middleware admin gating and the CSP header have no automated tests (middleware needs a Supabase mock harness).

## 5. Needs business approval or credentials
Twilio (SMS), roles/SSO product scope, audit-log retention policy and GDPR DPA wording, root-file cleanup, enforcing CSP, removing `/ai-test`, queue infrastructure choice, moving the import write phase into an RPC (schema change).

## 6. Roadmap
- **Quick wins (this week):** promote CSP after a week of clean reports; delete `/ai-test`; archive stale root docs; refresh README; drop `?secret=` cron auth.
- **30 days:** transactional import RPC; Twilio SMS; audit-log table with admin viewer; axe accessibility checks.
- **90 days:** team invites and roles (owner/manager/staff); per-business job queue for crons; Zapier/Make app and outbound webhooks; background large imports.
- **6 months:** multi-location and agency/white-label (custom domain, logo, email sender); visual journey builder; scheduled reports; SSO (SAML/OIDC) for a higher tier.
- **12 months:** SOC 2 Type I groundwork, EU/UK data-residency option, public API with scoped keys and usage metering, tiered pricing (Starter / Growth / Multi-location / Enterprise) keyed to SMS volume, locations and seats.

## 7. Follow-up pass (all earlier recommendations that could be done without outside credentials or live infrastructure)

| Item | Status | Files |
|---|---|---|
| Atomic CSV import totals (C5) | Done. Visit rows and customer totals now move in one Postgres function, `import_apply_visits` (migration `0039`); a failed write plus retry counts spend once. Two regression tests added | `supabase/migrations/0039_import_atomic_and_audit_log.sql`, `src/lib/customers.ts`, test fakes |
| Audit log (C6, part) | Done: `audit_log` table, `recordAudit()` helper, events for API-key regeneration, account export, account deletion, CSV import, admin org deletion, and an admin viewer at `/admin/audit-logs` | `src/lib/audit.ts`, `src/app/(app)/admin/audit-logs/page.tsx`, action files |
| Twilio SMS/WhatsApp (H2) | Code done (REST provider, no SDK, 5 tests). **Not verified against a live Twilio account** | `src/lib/messaging.ts` |
| Remove `?secret=` cron auth (H3) | Done. **Any external scheduler still using the query string must switch to `Authorization: Bearer`** or it will get 401 | `src/lib/cron-auth.ts`, README |
| Delete `/ai-test` (C1) | Done (page and API route removed) | |
| Archive stale root docs (H6), refresh README (H7) | Done; files moved to `docs/history/` | |

Verification: `tsc` clean, 589 tests pass, `next build` succeeds (with placeholder env vars).

**Must do before deploying:** apply migration `0039` to the database (the CSV import calls `import_apply_visits` and will fail without it).

**Still not done, and why:**
- Team invites, role management UI and SSO: needs a product decision on roles and an email/invite flow design; not started.
- Enforcing CSP: needs a week of browser violation reports first.
- Job queue for crons, background large imports (>2,000 rows), Zapier app, outbound webhooks, white-label, visual journey builder: multi-week projects needing infrastructure or product decisions.
- Automated accessibility (axe) tests: not added; needs a browser test harness.
- The `audit_log` and SMS provider have been tested only against fakes.

## 8. Sellability pass (local-business focus)

Findings from reading the buyer journey end to end: a new user could not send anything until they found and clicked "claim trial"; onboarding was generic; nothing proved value after sign-up; nothing sold to a specific trade; no growth loop; and the repo contained a personal email hard-coded as a free-access bypass.

| Change | Why it sells | Files |
|---|---|---|
| Free trial starts automatically when onboarding completes (still no card; idempotent, can't restart or extend) | Removes the biggest activation blocker | `src/lib/trial.ts`, onboarding + billing actions |
| Industry presets in onboarding: 10 trades pre-fill services and rebooking intervals | Reminders work from day one; "set up in minutes" | `src/lib/industries.ts`, onboarding form/action |
| 10 industry landing pages + `/for` index, FAQ and breadcrumb JSON-LD, sitemap, footer and home links | Search traffic and relevance for each trade; no invented stats or testimonials | `src/app/for/**`, `sitemap.ts`, footer, home |
| "Your return on Pentriq" dashboard card (revenue after reminder clicks, review-link follow-through, plan cost, honest empty states) | Proves value monthly, which drives retention | `src/lib/impact.ts`, `src/components/dashboard/impact-card.tsx` |
| Opt-in embeddable reviews widget with "Collected with Pentriq" credit | Customers' websites become a referral channel | `src/app/widget/**`, `src/lib/review-widget.ts`, review-link page, `next.config.mjs` (widget alone may be framed) |
| Pricing page: cost-per-day and payback framing, links to calculator and industries | Conversion on the pricing page | `src/app/pricing/page.tsx` |
| Billing bypass moved from a hard-coded personal email to `BILLING_OVERRIDE_EMAILS` | A buyer inherits no hidden free account | `src/lib/billing.ts`, `.env.example` |

**Apply migration `0040_industry_and_review_widget.sql`** (adds `businesses.industry` and `businesses.widget_enabled`). Choosing an industry in onboarding and the widget toggle fail without it.

**Action for the current owner:** set `BILLING_OVERRIDE_EMAILS=<your email>` in the environment, or your own account will be treated as a normal trial/paid account.

Verification: `tsc` clean, 599 tests pass, `next build` succeeds, and a production server returned the expected pages and headers. Not verified: widget rendering with real review data, onboarding presets against a real database, and the dashboard card with real attribution data (no database was available).

### Further ideas not built (need a decision or are larger)
Annual plan (needs a Stripe price), a second tier for multi-location, referral rewards for customers who refer another business to Pentriq, AI-drafted replies surfaced on the dashboard, competitor comparison pages (need verified facts about named products), and customer testimonials/case studies (need real customers).

## 9. Page-by-page review pass

Method: screenshots of the public pages at 1280px and 390px (no horizontal scroll; the only console error was a blocked external request in the sandbox), then code review of the signed-in pages and background jobs. Signed-in pages were reviewed from code, not rendered, because no database was available.

| Finding | Severity | Fix |
|---|---|---|
| **Demo-mode detection faked sends for real customers.** Any address containing "demo" or "test" (e.g. `contest.winner@gmail.com`, `latest@…`) was marked "sent" without being delivered | Critical | Detection now matches reserved test domains only; regression tests added (`src/lib/demo-mode.ts`) |
| **Silent 1000-row truncation.** Supabase caps a response at 1000 rows. The customers list, analytics, segments, revenue attribution and the nightly lifecycle job (rebooking, win-back, birthdays) all read whole tables in one query, so larger businesses got wrong totals and missed reminders | Critical | `src/lib/fetch-all.ts` pages through results and throws on error; applied at all five sites; the test fake now enforces the 1000-row cap so the tests prove it |
| Revenue attribution used `.in()` with thousands of ids (URL length failure) and an O(n²) lookup; segments re-read all data once per segment; analytics filtered all visits per customer | High | Chunked ids, indexed by customer, segment data loaded once |
| "AI-powered" was claimed everywhere but no AI feature was live (the drafting function was never called) | High (advertising-claims risk) | Real feature: **Draft with AI** for Google review replies (`src/lib/ai-review-reply.ts`). Reviewer name never sent to the model, review text fenced as untrusted, output stripped of links/emails/phone numbers, never auto-posted, 20 drafts/hour/business, hidden unless `GEMINI_API_KEY` is set |
| Customer replies to review emails went to the platform's sending address, so the business never saw them | High | `replyTo` set to the business contact email; settings field now marked recommended and explains this |
| Home hero still said the trial must be "claimed", jargon-heavy copy, no audience | Medium | Rewritten for UK local businesses; trial and price stated plainly |
| Pricing card listed 4 of ~15 features | Medium | Nine concrete perks |
| Signup: no terms/privacy acknowledgement, 6-char passwords, new users landed on the dashboard instead of the guided first send, stale metadata | Medium | Terms line, 8-char minimum, new accounts go to `/onboarding` (also after email confirmation), optional "Continue with Google" (`NEXT_PUBLIC_GOOGLE_SIGNIN=1`) |
| Trial banner told existing users to claim a trial on the billing page | Low | Points to onboarding |
| US number formatting (`en-US`) in a UK product | Low | `en-GB` throughout |

### Needs your attention (not code)
1. **Legal pages are placeholder text** (the component says so). Have Terms, Privacy and Cookies reviewed by a solicitor before taking payment.
2. **Google Business Profile API is approval-gated.** Until Google approves the project, `GOOGLE_BUSINESS_API_APPROVED` stays off and most users see "coming soon" for review sync, replies and alerts, which are headline features (the widget and AI replies depend on them).
3. **Sender domain.** If `EMAIL_FROM` is unset, mail goes from Resend's sandbox address. Verify a domain in Resend before onboarding real customers.
4. Set `GEMINI_API_KEY` to turn on AI replies; `NEXT_PUBLIC_GOOGLE_SIGNIN=1` after enabling the Google provider in Supabase.

Verification: `tsc` clean, 618 tests pass, `next build` succeeds. Not verified: AI drafting against the live Gemini API, Google sign-in, and the signed-in pages with real data.

## 10. Transformation pass: team access, operations and executive report

Date: 2026-11-02. This pass built on sections 1-9 above rather than repeating them.

### Scope and honesty about method
The request covered every area of the product. In this session I read, line by line: the auth middleware, business loader, provisioning, audit, API-key, cron-auth and rate-limit code, the settings server actions, the RLS policies for `businesses` and `business_members`, and the settings, customers and dashboard pages' structure. Everything else was assessed from structure and the three earlier audit passes. **I did not exercise anything against live Supabase, Stripe, Resend, Google or Twilio**, did not render signed-in pages (no database was available), and did not benchmark anything. Competitor comparisons are from general knowledge of those products, not fresh research. The scores and "business value" figures below are judgement, not measurement.

### New findings
| # | Finding | Severity |
|---|---|---|
| N1 | **Team access could not work even though the schema allowed it.** The `businesses` RLS policy had `WITH CHECK (owner_id = auth.uid())`, so only the owner could ever update the business row; a second member's settings saves would match zero rows and show a misleading error. There was also no invite flow, no role enforcement and no UI | High (blocks every multi-user sale) |
| N2 | Role column existed (`owner/admin/staff`) but nothing read it: every member could do everything, including billing, API keys and data export | High |
| N3 | No health endpoint for uptime monitors or load balancers | Medium |
| N4 | No skip-to-content link; keyboard users tab through the whole sidebar on every page | Medium (accessibility) |
| N5 | Hot query shapes had only single-column `business_id` indexes (customers list, visits windows, review-request lookup, click analytics) | Medium |
| N6 | `business_members.user_id` was not unique although the loader assumes one membership per user | Medium (data integrity) |

### Implemented
| Change | Files |
|---|---|
| **Roles and permissions**: one capability matrix (owner / admin / staff), least-privilege delegation (admin cannot mint admins; nobody can create a second owner) | `src/lib/permissions.ts`, `src/lib/business-access.ts`, `src/lib/business.ts` |
| **Enforcement** across about 20 files of server actions, pages and route handlers: settings, services, loyalty, reputation, integrations (API key, Google, booking), billing, account export, account deletion | `settings/**/actions.ts`, pages, `api/account/export`, connect routes |
| **Team management**: invite by email (single-use, SHA-256-hashed 256-bit token, bound to the invited address, 7-day expiry, re-invite revokes the old link, 10-person cap, 20 invites/hour/business), accept page, change role, remove, revoke, audit events for each | `src/lib/team.ts`, `settings/team/**`, `app/invite/[token]/**`, `src/lib/email.ts` |
| **Invite-aware auth**: `?next=` on login/signup/email-confirmation (validated by `safeNextPath`) so an invitee lands on the invite after signing up; an auto-created *empty* business (sole member, onboarding unfinished, no customers, no billing) is discarded on accept so invitees are not stranded | `auth-form.tsx`, login/signup pages, `team.ts` |
| **Migration 0041**: `team_invitations` (RLS on, service-role only), unique one-business-per-user, corrected `businesses` policies (members read; owner/admin update; billing columns still trigger-protected) | `supabase/migrations/0041_team_invitations_and_roles.sql` |
| **Migration 0042**: four composite indexes matching existing queries | `supabase/migrations/0042_performance_indexes.sql` |
| **`GET /api/health`** (readiness with 3 s dependency timeout, `?mode=live` liveness; 503 only on critical failure; never returns error text or secrets) | `src/lib/service-health.ts`, `src/app/api/health/route.ts` |
| Skip-to-content link and focusable `<main>`; "no access" notice on the dashboard | `(app)/layout.tsx`, `dashboard/page.tsx` |
| 27 new tests (permissions matrix, escalation, token hashing, expiry, wrong-email, re-invite, team cap, empty-business discard, cross-tenant safety, health semantics) | `team-and-permissions.test.ts`, `service-health.test.ts` |

Verification: `tsc --noEmit` clean; 58 suites / 644 tests pass; `next build` succeeds; on a production server `/api/health?mode=live` returned 200, `/api/health` returned 503 with the database unreachable (as designed, in 3 s), `/invite/<bad>` rendered publicly, and `/settings/team` redirected to login.

**Before deploying: apply migrations `0041` and `0042`.** Until `0041` is applied the Team page and invite link fail (no table), and admin teammates cannot save settings. `0041` fails if any user already has two memberships (the app never created that state, but check: `select user_id from business_members group by 1 having count(*) > 1;`).

### Known limits of what was built
- **Role enforcement is in the application layer.** RLS proves membership, not role, for every table except `businesses`. A staff user with the public anon key and their own session could still write rows such as `services` or `loyalty` settings directly through PostgREST. Closing that needs per-table, role-aware policies (a larger migration to be tested against a real database).
- A removed member keeps their login; the next sign-in gives them a fresh, empty business of their own.
- Team size cap and invite-rate limits are fixed constants; seat-based pricing is a product decision.
- Invite email delivery, the accept flow and migration `0041` have only been tested against in-memory fakes.
- The admin portal still uses the `ADMIN_EMAIL` allow-list rather than a role claim.

### Executive summary by area
| Area | State after this pass |
|---|---|
| Architecture | Sound: Next 14 App Router, Supabase with RLS, server actions, service-role jobs. Weak points: serverless crons loop over all tenants (H4), `schema.sql` is stale (migrations are the source of truth), several very large page files (dashboard ~600+ lines) |
| Security | Good baseline (tenant scoping, hashed API keys, timing-safe cron auth, rate limits, audit log, safe redirects). Gaps: RBAC only at app layer (above), CSP still report-only, admin by email list, no MFA/SSO |
| Performance | Fetch-all paging and chunking already fixed. Indexes added (unmeasured). Remaining: dashboard does many parallel queries per load with no caching; the customers page reads every customer row on each load (paged past the 1000-row cap, but not server-paginated) |
| UX | Consistent design system (cards, badges, toasts, command palette). Gaps: staff are redirected with a notice if they open a settings page, rather than not seeing the link; no saved filters; tables are not server-paginated |
| Commercial readiness | SMB-ready; now multi-user capable. Not enterprise-ready: no SSO/SCIM, no per-table DB roles, no DPA tooling, no SLA/status page |
| Competitive position | Strong vertical fit (UK, consent-aware review gathering, rebooking, loyalty). Behind horizontal tools on user-built automation, public API/webhooks, multi-location and reporting exports |

### Recommendations
Priority score = impact (Low 1, Medium 2, High 3, Critical 4) divided by effort (Low 1, Medium 2, High 3), rounded to one decimal; higher is sooner.

| # | Recommendation | Impact | Effort | Score | Business justification |
|---|---|---|---|---|---|
| R1 | Apply 0041/0042, set `BILLING_OVERRIDE_EMAILS`, Resend sender domain | Critical | Low | 4.0 | Nothing in this pass or the last works in production without them |
| R2 | Solicitor review of Terms/Privacy/Cookies (placeholders today) | Critical | Low | 4.0 | Cannot lawfully take payment or process customer data without them |
| R3 | Role-aware RLS policies on config tables (services, loyalty, journeys, segments, storage) | High | Medium | 1.5 | Makes "staff cannot change settings" true at the database, which enterprise buyers will test |
| R4 | Promote CSP from report-only after a week of clean reports | High | Low | 3.0 | Cheap, large reduction in XSS blast radius |
| R5 | Uptime monitor on `/api/health` plus alert on repeated rate-limiter errors | High | Low | 3.0 | Turns outages from customer-reported to team-detected |
| R6 | Per-business job queue for crons (H4) and background large imports (H5) | High | High | 1.0 | Required before tenant count makes cron runs time out; silent missed reminders |
| R7 | Server-side pagination, search and saved filters on customers; cache dashboard aggregates | High | Medium | 1.5 | Page weight and latency grow linearly with customers today |
| R8 | Outbound webhooks and a Zapier/Make app on the existing API key | High | Medium | 1.5 | Cheap distribution; the inbound endpoint and OpenAPI doc already exist |
| R9 | Admin portal on a role claim instead of an email list | Medium | Low | 2.0 | Removes a single-point operational risk |
| R10 | Multi-location / agency view and white-label sender | High | High | 1.0 | Opens the higher-priced tier; needs a pricing decision first |
| R11 | Visual journey builder and user-defined automations | Medium | High | 0.7 | Differentiator versus Monday/ClickUp-style tools, large build |
| R12 | SAML/OIDC SSO, MFA, SCIM, SOC 2 groundwork | High | High | 1.0 | Gate for mid-market and regulated buyers |
| R13 | Automated accessibility checks (axe) and keyboard-flow tests in CI | Medium | Medium | 1.0 | Protects the skip link and focus work from regressions |
| R14 | Hide settings links a role cannot open; role badge in the sidebar | Low | Low | 2.0 | Removes a confusing dead end for staff users |

### What I deliberately did not do
Rewrite the UI wholesale, add speculative AI features beyond the review-reply drafting from earlier, or rework crons into a queue. Each needs either production data to tune against, a product or pricing decision, or infrastructure that is not in this repository, and doing them blind would add risk without evidence of benefit. Estimated business value and performance gains are therefore not quantified here: the honest figure for index and health-check work is "unmeasured"; the measurable gain from this pass is that multi-user accounts can now be sold and operated.

## 11. Implementation pass: customers workspace, role-aware UI, outbound webhooks

| Change | Files |
|---|---|
| **Customers screen rebuilt**: multi-term search (`/` focuses it), sortable columns with `aria-sort`, status filters with counts, shareable URL state (`?q=&status=&sort=&dir=`, validated), 50-row pages instead of rendering every customer, row selection with bulk send/cancel (server re-validates ids, scopes to the business, caps at 25), CSV export of the current view for owners/admins only (shares the formula-injection-safe writer with the account export) | `src/lib/customer-list.ts`, `customers-table.tsx`, `customers/actions.ts` |
| **Role-aware UI**: `RoleProvider` in the app layout; sidebar, Settings tabs and command palette hide what the role cannot use; palette gained Team, Integrations and Billing commands. Server checks remain authoritative | `role-context.tsx`, `sidebar-nav.tsx`, `settings-tabs.tsx`, `command-palette.tsx` |
| **Outbound webhooks**: signed (HMAC-SHA256 with timestamp), HTTPS-only, SSRF-guarded (literal and resolved addresses), no redirects, encrypted secret shown once, 3 s timeout, delivery log, auto-off after 10 consecutive failures, test/rotate/delete, audit events. Emitted for `customer.created` and `feedback.received` | `src/lib/webhooks.ts`, `settings/integrations/webhook-*.tsx`, migration `0043`, `docs/WEBHOOKS.md` |
| Typed rows for `team_invitations`, `webhook_endpoints`, `webhook_deliveries` | `database.types.ts` |

Verification: `tsc` clean; 60 suites / 687 tests pass (43 new: list logic, URL-state sanitising, CSV injection, bulk id sanitising, SSRF matrix, signature verification, delivery, auto-disable, emit); `next build` succeeds.

**Apply migration `0043` before using the webhook panel** (the Integrations page reads the new tables and will error without them). Webhooks also need `GOOGLE_TOKEN_ENCRYPTION_KEY`.

Not verified: any of the UI in a browser against real data (no database available), the bulk send against a live mailer, and webhook delivery to a real receiver. Not done: retries with backoff, webhooks for CSV/booking imports, per-event payload versioning, server-side pagination of the customers query (the page still loads all rows, now rendered 50 at a time), and anything from the "needs a decision or infrastructure" list in section 10.
