# Pentriq release readiness report

Assessment date: 3 November 2026. Branch `claude/awesome-rubin-l9dede`, rebased on `main` at `3a0bd23`.
The baseline ("Before") is `main` at `dfaf1db`, before this programme. Since then `main` has gained the Next.js 15
upgrade and Dependabot's transitive security fixes through PR #7 (`3a0bd23`); this branch builds on that.

**Headline:** release readiness for Pentriq's market (UK small businesses, self-serve, £19 a month) moves from
**4/10 to 7/10**. The code-side blockers found in this audit are fixed and tested. What stands between 7 and 9 is
mostly **not code**: legal review, a live Stripe test, a 5-minute send schedule, uptime monitoring, backups and a
staging walkthrough with real accounts. These are listed with owners in [Human actions required](#human-actions-required).
Two code items, an end-to-end suite for signed-in flows and server-side pagination of the customer list, close
the remaining distance. Against the enterprise benchmark (Microsoft, Salesforce, Atlassian and the others in
section 2), Pentriq is **3/10**. That is expected for an SMB product, and the gaps are listed so they become
decisions rather than surprises.

How to read this report:

- Every finding cites a file, function, route or database entity. Where the repository has no evidence of
  something, the report says **"Not evidenced in codebase."**
- Scores are out of 10. "Before" is `main` at `dfaf1db`; "After" is this branch (which includes PR #7).
- The competitor comparisons in sections 2 and 3 describe the vendors' publicly documented enterprise tiers in
  general terms. They come from general knowledge and were not re-verified live during this audit.

Contents:

1. [Audit: 50 categories](#1-audit-50-categories)
2. [Enterprise gap analysis](#2-enterprise-gap-analysis)
3. [Revenue: missing features, advantages, deal breakers](#3-revenue-missing-features-advantages-deal-breakers)
4. [What was implemented](#4-what-was-implemented)
5. [Code review](#5-code-review)
6. [UX review](#6-ux-review)
7. [Security audit and findings report](#7-security-audit-and-findings-report)
8. [Performance audit](#8-performance-audit)
9. [Reassessment](#9-reassessment)
10. [Human actions required](#human-actions-required)

---

## 1. Audit: 50 categories

### A. Product and UX

| # | Category | Before → After | Evidence | Weaknesses | Priority improvement |
|---|---|---|---|---|---|
| 1 | Core feature completeness | 7 → 7 | Review requests and follow-ups (`src/app/api/send-review-requests/route.ts`, `src/app/api/send-messages/route.ts`, `src/lib/journeys.ts`). Private feedback (`src/app/feedback/`, `src/app/(app)/feedback-inbox/`). Google reviews (`src/lib/google-review-sync.ts`). Loyalty and referrals (`src/app/(app)/settings/loyalty/`, `src/app/(app)/referrals/`). Segments, insights (`src/lib/intelligence/`). Booking sync for Square, Acuity and Calendly (`src/lib/booking-sync/`). | Google review sync is off until Google approves the API (`GOOGLE_BUSINESS_API_APPROVED`, `src/lib/launch-readiness.ts` check `google`). SMS has never been sent through a live Twilio account (comment on `TwilioSmsProvider`, `src/lib/messaging.ts`). | Get Google API approval and test Twilio live (human actions H13, H14). |
| 2 | Onboarding, activation and in-app guidance | 6 → 6 | `src/app/(app)/onboarding/`, `src/app/(app)/how-it-works/`, the Next best actions panel (`src/lib/intelligence/next-best-actions.ts`). | Help centre, product tour, in-app chat and support ticketing: **Not evidenced in codebase.** | Add a first-week checklist driven by next-best-actions, and a help link to a support inbox. |
| 3 | Navigation and information architecture | 7 → 7 | App shell and sections under `src/app/(app)/`; settings tabs (`src/components/settings-tabs.tsx`). Staff no longer see settings links they cannot use. | Not independently user-tested: **Not evidenced in codebase.** | Five-user hallway test during the staging walkthrough (H12). |
| 4 | Design system and visual consistency | 7 → 7 | 22 primitives in `src/components/ui/`; colour tokens in `src/app/globals.css`, including print styles. | Some pages still use one-off utility combinations (for example `src/app/(app)/dashboard/page.tsx`, 648 lines). | Extract repeated card and stat patterns as the pages are next touched. |
| 5 | Accessibility (WCAG 2.1 AA) | 4 → 8 | `scripts/a11y-audit.mjs`: axe-core 4.11.4 in Chromium on 21 public pages, desktop light, desktop dark and phone. 0 serious or critical violations in 63 page views, down from 40 failures. Runs in CI job `accessibility` (`.github/workflows/ci.yml`). Contrast tokens fixed in `globals.css`. | Signed-in pages are not covered by axe (they need a database). | Extend the audit to signed-in pages in the E2E suite (section 9, next steps). |
| 6 | Mobile and responsive | 6 → 7 | The phone-width (390 px) no-sideways-scroll check in `scripts/a11y-audit.mjs` passes on every public page. | Signed-in pages are not checked automatically. Native app: **Not evidenced in codebase.** | Same as #5. |
| 7 | Empty, loading and error states | 7 → 7 | `src/app/(app)/error.tsx`, `loading.tsx`, `not-found.tsx`; `src/app/global-error.tsx`; `src/components/ui/empty-state.tsx`; skeletons in `src/app/(app)/dashboard/intelligence-sections.tsx`. | None found in this audit. | Keep each new page using the shared states. |
| 8 | Search, command palette and notifications | 7 → 7 | `src/components/command-palette.tsx`, `src/app/(app)/search-actions.ts`, `src/components/notification-center.tsx`, `src/components/keyboard-shortcuts.tsx`. | Search covers customers and navigation only; no full-text search over feedback. | Add feedback text to search once volumes justify it. |
| 9 | Product analytics (usage telemetry) | 1 → 1 | **Not evidenced in codebase.** No PostHog, Plausible or Google Analytics. | Activation, retention and funnel drop-off cannot be measured. | Add privacy-friendly, consented analytics before spending on acquisition. |
| 10 | Internationalisation and localisation | 3 → 3 | UK English and en-GB formatting throughout (`src/lib/uk-defaults.ts`); the timezone is pinned to Europe/London (`jest.config.js`). An i18n framework: **Not evidenced in codebase.** | UK only. This is deliberate for the launch market. | Only when entering a non-English market. |

### B. Engineering

| # | Category | Before → After | Evidence | Weaknesses | Priority improvement |
|---|---|---|---|---|---|
| 11 | Architecture and code organisation | 7 → 7 | Next.js App Router with server components and server actions. 140 domain modules in `src/lib/`. Supabase with RLS. Admin-only service-role client (`src/lib/supabase/admin.ts`). | Business logic sits partly in route files (the cron routes are about 300 lines each). | Move per-row send processing into `src/lib/` when it next changes. |
| 12 | Type safety | 7 → 8 | `"strict": true` (`tsconfig.json`). The hand-written `src/lib/database.types.ts` (1,059 lines) is now checked against the migrated schema by `scripts/check-schema-drift.mjs`. | Types are hand-written, not generated. A few `as unknown as` casts remain (for example the migration probes in `src/app/(app)/admin/readiness/page.tsx`). | Generate types from the database in CI (`supabase gen types`). |
| 13 | Maintainability and code health | 6 → 6 | Consistent module boundaries; comments explain intent. | Large files: `src/lib/customers.ts` (779 lines), `src/app/(app)/dashboard/page.tsx` (648), `src/components/command-palette.tsx` (474). | Split by feature when next edited. |
| 14 | Unit and integration tests | 7 → 8 | 73 Jest suites, 835 tests, all passing. Includes route-level tests: `unsubscribe-route.test.ts`, `send-claim.test.ts` (overlapping cron runs), `admin-mfa.test.ts` (middleware), `customer-privacy.test.ts`. | Coverage percentage is not measured: **Not evidenced in codebase.** | Add `--coverage` reporting to CI (report only, no gate at first). |
| 15 | End-to-end tests | 1 → 3 | Public pages are driven in a real browser by `scripts/a11y-audit.mjs`. Signed-in journeys (sign-up → send → click → feedback → billing): **Not evidenced in codebase.** | Supabase's local stack could not be pulled in this environment (Docker Hub 429, ECR 403), so no signed-in E2E could be built or proven here. | Playwright suite against `supabase start` on GitHub Actions runners. **The main engineering item left.** |
| 16 | CI/CD | 4 → 8 | `.github/workflows/ci.yml` has three jobs. `verify`: tsc, Jest, `next build`, `npm audit --omit=dev --audit-level=high`. `database`: PostgreSQL 16, all migrations twice, RLS suite, claim race test, drift check. `accessibility`. | Deployment is on Vercel and configured outside the repository (only crons are in `vercel.json`). Preview-environment smoke tests: **Not evidenced in codebase.** | Run `/api/health` and the a11y audit against each Vercel preview. |
| 17 | Dependencies and supply chain | 5 → 7 | `npm audit`: production 4 low (`resend` → `@react-email/render`, no non-breaking fix), 0 moderate, 0 high, 0 critical; all dependencies 7 low and 17 moderate (dev-only Jest toolchain). Dependabot (`.github/dependabot.yml`), weekly grouped updates. CodeQL code scanning on every pull request (GitHub default setup, configured in repository settings); the CI token is read-only (`permissions: contents: read`). | Tailwind stays on 3.4.13: Dependabot's grouped branch reached `main` through PR #7 with its Tailwind 4 bump left out, because Tailwind 4 breaks the styling. | Upgrade `resend` when a fixed major is out; plan Tailwind 4 as its own task. |
| 18 | Framework currency | 4 → 8 | Next.js 14 → 15.5.28 (`5df0f10`), with async `params`, `searchParams` and `cookies()` converted (`d1c6067`); both reached `main` in PR #7. | `react` / `react-dom` 18.3.1 in `package.json` (the App Router uses Next's bundled React). | Move to React 19 when the dependency group allows it. |
| 19 | Database migrations | 5 → 8 | 45 migrations plus `supabase/schema.sql`, all safe to re-run (CI applies them twice). `0009` fixed for fresh databases. A ledger, `public.schema_migrations`, starts at `0045`. | Applied by hand in the Supabase SQL editor; no deploy-time runner or down-migrations: **Not evidenced in codebase.** | Adopt `supabase db push` with the ledger, once the production project is linked (human). |
| 20 | Schema and type drift control | 2 → 8 | `scripts/check-schema-drift.mjs` checks every `.from().select()` column, filter, embed and `database.types.ts` row key: 0 errors on the real schema, 20 on a deliberately broken snapshot. | Static: it cannot see column names built at runtime. | Combine with generated types (#12). |

### C. Security

| # | Category | Before → After | Evidence | Weaknesses | Priority improvement |
|---|---|---|---|---|---|
| 21 | Authentication and password policy | 6 → 7 | Supabase Auth. One policy, `src/lib/password-policy.ts` (`checkPassword`: 8–72 characters, common passwords and the email refused), now used by sign-up and reset. Reset used to accept 6 characters. | Login (`signInWithPassword` in `src/components/auth-form.tsx`) relies on Supabase Auth's own rate limits. CAPTCHA: **Not evidenced in codebase.** | Turn on Supabase CAPTCHA and pass `captchaToken` (H16). |
| 22 | Two-factor authentication | 0 → 8 | TOTP via `src/lib/mfa.ts` (`mfaGate`, `adminMfaGate`, `enrolledFromClaims`), `/mfa`, `/account/security`. Organisation policy `businesses.require_mfa` (`0045`), admin reset (`resetMemberMfa`, `src/lib/team.ts`). Enrolment is read from signed claims, never from the cookie's `user.factors`. | Recovery codes and passkeys: **Not evidenced in codebase.** A sole owner who loses a device needs an operator to remove the factor in Supabase. | Prompt for a second authenticator at enrolment; add recovery codes when Supabase supports them. |
| 23 | Authorisation and roles | 7 → 7 | Capability matrix `src/lib/permissions.ts` (owner / admin / staff, `can()`); restrictive database policies on configuration tables (`0044`). | `messages` and `loyalty_ledger_entries` can be written by any member of the business (`supabase/schema.sql`, policies "Member can manage own messages" and "Member can manage own loyalty_ledger_entries"). Within one tenant, by design: staff record visits that award points. | Accepted; revisit if staff fraud becomes a customer concern. |
| 24 | Tenant isolation (RLS) | 6 → 9 | RLS on every public table. `supabase/tests/rls.test.sql` (49 assertion statements: anonymous, non-member, cross-tenant, staff, admin, owner, service role) runs in CI. Live check `public.rls_status()` on `/admin/readiness`. The suite found anonymous `EXECUTE` on `import_apply_visits`; it is revoked in `0045`. | None open. | Keep adding a test with every new table. |
| 25 | Web hardening (headers, CSP) | 5 → 7 | `next.config.mjs`: HSTS, nosniff, frame and referrer policies, COOP, Permissions-Policy. An enforced minimal CSP (`object-src 'none'; base-uri 'self'; frame-ancestors 'self'`), plus the full policy in report-only mode with violation reports to `/api/csp-report` (`src/lib/csp-report.ts`). | The full CSP still only reports; it does not block. | Promote it after 7 days of clean reports (H11). |
| 26 | Request integrity (CSRF, redirects, OAuth state) | 6 → 8 | `src/lib/same-origin.ts` (`isSameOriginRequest`) guards the cookie-authenticated `POST` handlers (`api/send-review-request`, `api/send-rebooking-reminder`). `src/lib/safe-redirect.ts`; OAuth `state` checks. Unsubscribe `GET` no longer changes anything. | Server actions rely on Next's built-in origin check (framework behaviour, not repository code). | None needed now. |
| 27 | Secrets and encryption at rest | 7 → 8 | AES-256-GCM for OAuth tokens and webhook secrets (`src/lib/google-token-crypto.ts`). SHA-256 for API keys (`src/lib/api-keys.ts`) and invitation tokens. `isAes256Key` validates the key on the readiness page. | Key rotation procedure: **Not evidenced in codebase.** | Document rotation; support two keys during a changeover. |
| 28 | Rate limiting and abuse protection | 6 → 7 | Database-backed `rate_limit_hit` (`src/lib/rate-limit.ts`) on public endpoints, including `/api/csp-report` and the customer export (60 an hour). | Sign-in throttling is Supabase's, not Pentriq's (#21). | H16. |
| 29 | Audit logging | 5 → 8 | `src/lib/audit.ts` (`recordAudit`, best-effort so it never blocks the user's action); `audit_log` (`0039`). New events: `security.*`, `team.mfa_reset`, `customer.exported`, `customer.erased`, `settings.updated`, `services.changed`, `loyalty.changed`, `integration.connected` / `integration.disconnected`. Viewer and CSV export at `/settings/security`. | Streaming to a SIEM: **Not evidenced in codebase.** | Only on enterprise demand. |
| 30 | Operator (platform admin) access | 3 → 7 | `ADMIN_EMAIL` allow-list (`src/lib/admin-access.ts`), now also requiring a two-factor (`aal2`) session via `adminAccess()`. Checked in `src/middleware.ts`, `src/app/(app)/admin/layout.tsx`, `requireAdminApi` (`src/lib/admin-guard.ts`) and the admin server actions (`935f7e3`). | Operator identity is an environment variable, not a role table. Operator reads of tenant data are not audited; only deletion is (`admin.organisation_deleted`). | Audit operator page views of tenant data. |

### D. Privacy and compliance

| # | Category | Before → After | Evidence | Weaknesses | Priority improvement |
|---|---|---|---|---|---|
| 31 | Data subject rights | 4 → 8 | Business export `src/app/api/account/export/`. Per-customer export `src/app/api/customers/[customerId]/export/route.ts`. Erasure via `eraseCustomer` (`src/lib/customer-privacy.ts`), with suppression and a cascade proven in `rls.test.sql`. Account deletion in `src/app/(app)/settings/privacy/`. | Requests are fulfilled by the business; a subject-facing request portal is **Not evidenced in codebase** (normal for a processor). | None for launch. |
| 32 | Consent, suppression and unsubscribe | 5 → 8 | RFC 8058 one-click (`List-Unsubscribe-Post`, `src/lib/messaging.ts`, `src/lib/email.ts`). `GET /api/unsubscribe/[customerId]` only shows a confirmation; `POST` unsubscribes (`src/lib/unsubscribe-page.ts`). `resolveChannel` (`src/lib/messaging.ts`) never picks an opted-out channel. Suppression list. | PECR soft opt-in wording at the point of collection depends on each business: **Not evidenced in codebase.** | Add guidance text to the customer import and add-customer screens. |
| 33 | Data retention | 6 → 7 | `src/lib/retention.ts`, `/api/apply-retention` (daily 02:30 in `vercel.json`). | Retention defaults are not legally reviewed. | Part of H3. |
| 34 | Sub-processor transparency | 2 → 7 | `src/lib/subprocessors.ts` and the `/subprocessors` page (Supabase, Vercel, Resend, Stripe, Sentry, Google, Twilio, Square / Acuity / Calendly). | Processing regions are not confirmed. | H5. |
| 35 | Legal documents | 3 → 3 | `/terms`, `/privacy`, `/cookies` exist; the readiness checklist marks them as drafts (`HUMAN_ITEMS`, `src/app/(app)/admin/readiness/page.tsx`). | Not reviewed by a solicitor; no DPA. | H3, H4. |
| 36 | Certifications and third-party assurance | 0 → 1 | None. `/security` says so under "What we don't claim" (`src/app/security/page.tsx`): no SOC 2, no ISO 27001, no SAML. | Blocks enterprise procurement. | Decision H19; an independent penetration test first (H21). |
| 37 | Vulnerability disclosure and security docs | 2 → 8 | `SECURITY.md`, `/.well-known/security.txt` (RFC 9116, `src/app/.well-known/security.txt/route.ts`), `/security`. | Response targets (SLAs) are not committed. | H18. |

### E. Operations and reliability

| # | Category | Before → After | Evidence | Weaknesses | Priority improvement |
|---|---|---|---|---|---|
| 38 | Error monitoring and structured logging | 6 → 7 | Sentry (`@sentry/nextjs` 11.6, `src/lib/monitoring.ts` `captureError` with tags). Request ids from middleware tag errors (`setErrorContext`). Privacy-safe JSON logs with masked emails and dropped secrets (`src/lib/log.ts`). | Alert rules live in Sentry, outside the repository. | H9. |
| 39 | Health checks and uptime monitoring | 4 → 5 | `/api/health` checks the database (`src/app/api/health/route.ts`, `no-store`). An external uptime monitor: **Not evidenced in codebase.** | Nobody is paged when the site is down. | H8. |
| 40 | Scheduled job reliability | 3 → 7 | Sends are claimed before they go out (`claimDue`, `src/lib/send-claim.ts`), carry a per-attempt idempotency key (`sendIdempotencyKey`), run oldest first in batches within a 45 s budget (`maxDuration` 60) and hand back unreached rows (`releaseClaims`). Proven on PostgreSQL by `supabase/tests/claim-race.sh` (8 simultaneous runs, 50 rows, each claimed exactly once). The readiness page flags sends more than 26 hours overdue (`sendBacklogCheck`). | `vercel.json` runs the send jobs once a day (Vercel Hobby limit), so a request can wait up to 24 hours. A job-run history table: **Not evidenced in codebase.** | 5-minute schedule (H7). |
| 41 | Backups and disaster recovery | 2 → 2 | **Not evidenced in codebase.** Depends on the Supabase plan (daily backups or point-in-time recovery). No restore drill on record. | Unknown recovery point and recovery time. | H10. |
| 42 | Incident response and status communication | 1 → 3 | Disclosure process in `SECURITY.md`. A runbook and status page: **Not evidenced in codebase.** | No agreed process when something breaks. | H24. |
| 43 | Configuration validation and launch checks | 2 → 8 | `evaluateConfig` (`src/lib/launch-readiness.ts`, 13 checks that never echo values); `/admin/readiness` (database, migrations, live RLS, send backlog); a boot-time `config_check` log line (`src/instrumentation.ts`). | Optional integrations show as warnings until configured. | Clear the warnings that apply to you. |
| 44 | Email deliverability | 6 → 7 | `List-Unsubscribe` headers; the readiness check `email-from` refuses `resend.dev` senders; DMARC aggregate reports are arriving for pentriq.cloud. | The DMARC policy is still monitoring-only. | H15. |

### F. Performance and scale

| # | Category | Before → After | Evidence | Weaknesses | Priority improvement |
|---|---|---|---|---|---|
| 45 | Front-end performance | 6 → 8 | `/reviews` route JS fell from 112 kB to 5.44 kB (first load 291 kB → 184 kB) after lazy charts (`src/app/(app)/reviews/review-charts-lazy.tsx`). The dashboard streams its intelligence sections with `<Suspense>` (`intelligence-sections.tsx`). Shared first load is 170 kB. | `/account/security` (254 kB) and `/mfa` (250 kB) load the browser Supabase client. | Acceptable; lazy-load the QR step if it matters. |
| 46 | Data scalability | 4 → 5 | `listTeam` looks members up in parallel (`src/lib/team.ts`); cron batches go oldest first. | `/customers` loads every row with `fetchAll` (`src/app/(app)/customers/page.tsx:47`), with no server pagination. Segment campaigns send 25 per click (`CAMPAIGN_LIMIT`, `src/app/(app)/segments/actions.ts:15`). `loadIntelligence` makes 13 queries (`src/lib/intelligence/load.ts`), memoised per request. The admin organisations table looks up each owner separately (`admin-businesses-table.tsx`). Load testing: **Not evidenced in codebase.** | Server pagination for `/customers` first. |

### G. Commercial and ecosystem

| # | Category | Before → After | Evidence | Weaknesses | Priority improvement |
|---|---|---|---|---|---|
| 47 | Billing and subscriptions | 7 → 7 | Stripe trial, subscription, portal, pause and resume (`claimTrial`, `startSubscription`, `openBillingPortal`, `pauseSubscription`, `resumeSubscription` in `src/app/(app)/settings/billing/actions.ts`); webhook `src/app/api/stripe/webhook/route.ts`; 30-day trial (`TRIAL_DAYS`, `src/lib/billing.ts`). | Live mode has not been tested. One plan (£19 a month, `PLAN.priceMonthly`), no annual plan. | H6, H20. |
| 48 | Integrations, public API and webhooks | 7 → 7 | Google Business Profile (`src/lib/google-business.ts`); Square, Acuity and Calendly (`src/lib/booking-sync/`). Inbound API with hashed keys (`src/app/api/integrations/service-completed/route.ts`, `src/lib/api-keys.ts`). Outbound webhooks with HMAC-SHA256, SSRF guards and retries (`src/lib/webhooks.ts`, `0043`). Zapier through webhooks (`/integrations/docs`). | An OpenAPI specification: **Not evidenced in codebase.** The API is write-only (one event type). | Read endpoints plus an OpenAPI file when a partner asks. |
| 49 | Reporting, analytics and AI | 7 → 7 | `src/lib/intelligence/` (business health, next best actions, forecast, review themes, natural-language query, report); `/insights`; `/reports`; weekly summary email (`/api/send-weekly-summary`); Gemini reply drafts (`src/lib/gemini.ts`, `src/lib/ai-review-reply.ts`). | AI needs `GEMINI_API_KEY`; review text goes to Google (listed on `/subprocessors`). | None for launch. |
| 50 | Enterprise administration (SSO, SCIM, multi-workspace) | 1 → 2 | Roles, an organisation 2FA policy and an audit log exist. SAML / OIDC SSO and SCIM: **Not evidenced in codebase.** One business per login, enforced by `business_members_one_business_per_user_idx` (`0041`). | Multi-site groups and agencies cannot manage several businesses from one login. | Multi-business membership before SSO (section 3). |

**Mean of the 50 categories: 4.6 before → 6.5 after.** The headline 4 → 7 weights the categories that decide whether
a small business can safely pay and use the product (security, data, sending, billing, legal). Enterprise-only
categories (36, 50) weigh little in it.

---

## 2. Enterprise gap analysis

The benchmark is the enterprise tier that Microsoft, Atlassian, Salesforce, Monday.com, Asana, Jira, ServiceNow,
Linear, Notion, ClickUp and Airtable document publicly. Common to all of them:

- SAML SSO, usually with SCIM provisioning;
- admin consoles and audit logs;
- SOC 2 Type II and/or ISO 27001 reports;
- uptime SLAs and public status pages;
- data residency options for large customers;
- APIs with published specifications;
- integration marketplaces.

None of these vendors competes directly with Pentriq, a review and retention tool for local businesses. They
set the bar an enterprise buyer, CTO or security team brings to any SaaS purchase.

| Gap | Severity | Business impact | Technical impact | Revenue impact | Difficulty | Recommendation |
|---|---|---|---|---|---|---|
| Independent assurance: SOC 2 / ISO 27001 (#36) | High (enterprise), Low (SMB) | Security questionnaires stall without a report | Policies, evidence collection, vendor reviews | Closes off enterprise and franchise deals | High (months, paid audit) | Not before product–market fit. A penetration test first (H21); the `/security` page is honest meanwhile |
| SAML / OIDC SSO (#50) | High (enterprise), Low (SMB) | IT teams require it on enterprise tiers | Supabase Auth supports SAML SSO on paid plans; needs a domain-to-organisation mapping | Gates larger contracts | Medium | Build after multi-business membership; charge for it |
| SCIM provisioning (#50) | Medium | Joiners and leavers handled manually | Needs a SCIM endpoint and an identity mapping | Only matters alongside SSO | Medium | After SSO |
| Multi-workspace / multi-location under one login (#50) | High | Salon groups, franchises and agencies cannot use one account (`0041` unique index) | Drop the unique index; add a workspace switcher; `loadBusiness` (`src/lib/business.ts`) must select by chosen business | Blocks the highest-value SMB segment (groups) | Medium | **Highest-value enterprise-style gap for this market** |
| Uptime SLA and status page (#39, #42) | Medium | Buyers ask "what happens when you are down?" | External monitor plus a status page | Affects trust more than deals | Low | H8, H24 |
| Backups and DR evidence (#41) | High | Unknown recovery time is a deal and audit risk | Supabase PITR plus a restore drill | Indirect (churn after data loss) | Low | H10 |
| Data residency disclosure (#34) | Medium | UK and EU buyers ask where data lives | Confirm the Supabase region and transfer mechanisms | Affects regulated buyers | Low | H5 |
| Published API specification and read endpoints (#48) | Medium | Partners and agencies want to pull data | OpenAPI file, read routes, scoped keys | Partner channel | Medium | When a partner asks |
| Integration marketplace (#48) | Low | Discoverability only | — | Small for SMB | High | Rely on Zapier through webhooks (`/integrations/docs`) |
| Granular custom roles (#23) | Low | Three roles cover small teams | `src/lib/permissions.ts` is ready for more | Small | Low | Wait for demand |
| Session controls: timeout, IP allow-list (#21) | Medium | Common enterprise checklist item | Supabase Auth settings plus organisation policy fields | Small | Low–Medium | Configure Supabase session timebox (H17) |
| Audit log streaming / SIEM (#29) | Low | Enterprise security teams | Webhook or export of `audit_log` | Small | Low | CSV export exists; stream on demand |
| Accessibility conformance statement / VPAT (#5) | Medium (public sector) | Procurement checklists | Document the axe results | Small | Low | Publish a statement using the CI audit evidence |
| DPA and contract terms (#35) | High | Article 28 makes a DPA mandatory for processors | — | Blocks any business buyer who asks | Low (legal) | H4 |
| Product analytics (#9) | Medium | Cannot steer growth | Consent-aware analytics | Indirect | Low | Before paid acquisition |
| End-to-end tests (#15) | Medium | Regressions in signed-in flows found by customers | Playwright plus Supabase local stack in CI | Churn risk | Medium | Next engineering task |

---

## 3. Revenue: missing features, advantages, deal breakers

### Missing feature matrix (what the target customer would look for)

| Feature | Present? | Evidence | Who notices | Priority |
|---|---|---|---|---|
| Google reviews pulled in live | Built, not live | `src/lib/google-review-sync.ts`; gated by `GOOGLE_BUSINESS_API_APPROVED` | Every customer | Critical (H13) |
| Requests sent within minutes of a visit | Daily by default | `vercel.json` crons are `0 8 * * *` and `0 9 * * *` | Every customer | High (H7) |
| SMS / WhatsApp | Built, untested live | `TwilioSmsProvider`, `src/lib/messaging.ts` | Customers with phone-first clients | Medium (H14) |
| Several locations under one login | No | unique index in `0041` | Groups and agencies | High |
| Annual plan / tiers | No | single `PLAN` in `src/lib/billing.ts` | Price-sensitive and larger buyers | Medium (H20) |
| In-app help and support | No | **Not evidenced in codebase.** | New users stuck in setup | Medium |
| Native mobile app | No | **Not evidenced in codebase.** Responsive web only | Owners on the shop floor | Low |
| Review widget for the business's own site | Yes | `src/app/widget/`, `businesses.widget_enabled` (`0040`) | — | — |
| Private feedback before public review | Yes | `src/app/feedback/`, `/feedback-inbox` | — | — |
| Loyalty, referrals, rebooking reminders, win-back | Yes | `src/app/(app)/settings/loyalty/`, `src/app/(app)/referrals/`, `src/app/api/scan-customer-lifecycle/` | — | — |
| CSV import and booking-system sync | Yes | `src/lib/csv-import-mapping.ts`, `src/lib/booking-sync/` | — | — |

### Competitive advantage matrix

| Advantage | Evidence | Why it sells |
|---|---|---|
| Click tracking that ignores email scanners and link previews | `src/lib/click-tracking.ts` (scanner, prefetch and HEAD classification); `src/app/r/[token]/route.ts` | Honest conversion numbers; competitors' "clicks" are often scanner noise |
| Scanner-proof unsubscribe | `src/app/api/unsubscribe/[customerId]/route.ts` (GET confirms, POST acts), RFC 8058 | Customers are not silently unsubscribed by security software |
| Never double-sends | `src/lib/send-claim.ts`, `supabase/tests/claim-race.sh` | A double review request annoys the business's own clients |
| Retention suite in one product (reviews, feedback, loyalty, referrals, rebooking, win-back) | sections above | Replaces several single-purpose tools at £19 |
| Plain-English intelligence: health score, next best actions, forecast | `src/lib/intelligence/` | Owners get "do this next", not dashboards |
| UK-first: GBP, en-GB dates, UK GDPR material | `src/lib/uk-defaults.ts`, `/subprocessors`, `/security` | Local trust, simpler buying |
| Security above SMB norm: 2FA policy, RLS proven in CI, audit log, honest trust page | `src/lib/mfa.ts`, `supabase/tests/rls.test.sql`, `src/lib/audit.ts`, `src/app/security/page.tsx` | Wins the cautious owner and the occasional IT-minded buyer |
| Booking-system sync (Square, Acuity, Calendly) | `src/lib/booking-sync/` | Requests go out without manual entry |

### Deal breaker matrix

| Audience | Deal breaker today | Status | Owner |
|---|---|---|---|
| Paying customer | Google reviews not live; requests up to a day late; untested live payment | Code ready; needs H13, H7, H6 | Human |
| CTO | No signed-in E2E tests; hand-written DB types; no backup evidence | E2E and types are engineering next steps; backups H10 | Engineering + human |
| Security team | Full CSP report-only; no penetration test; no SOC 2 | CSP H11; pen test H21; SOC 2 H19 | Human |
| Procurement | Draft terms and privacy policy; no DPA; regions unconfirmed | H3, H4, H5 | Human (legal) |
| Investor | No product analytics; single plan; no multi-location | #9, H20, multi-business work | Human decision + engineering |

### The five questions

**What would stop a customer paying today?**
- Google review sync is not live yet (H13). It is the headline feature on review management.
- With the daily schedule, a review request can arrive the day after the visit, not the same hour (H7).
- Stripe live mode has not been proven with a real card (H6).

**What would stop a CTO approving it?**
- No automated tests of signed-in journeys (#15).
- Database types are hand-written. They are drift-checked but not generated (#12).
- No evidence of backups or a restore (#41).
- The architecture, RLS proof, CI and dependency state would pass review.

**What would stop a security team approving it?**
- No independent penetration test (H21) and no SOC 2 or ISO report (#36).
- The full CSP is not yet enforced (H11).
- Sign-in has no CAPTCHA and relies on Supabase's limits (#21).
- They would find two-factor with an organisation policy, an operator console that needs two-factor, tenant
  isolation tested on every change, an audit log, and a disclosure policy.

**What would stop procurement approving it?**
- Draft legal documents (H3), no DPA (H4) and unconfirmed processing regions (H5).
- For enterprise procurement, also no SSO, SLA or assurance report.

**What would stop an investor funding it today?**
- No usage analytics, so activation and retention cannot be shown (#9).
- One price point with no expansion path such as tiers, annual billing or multi-location (H20, #50).
- No live customers on record: **Not evidenced in codebase.**

---

## 4. What was implemented

The first two commits below reached `main` through PR #7. The rest are this branch's eleven commits on top of it.

| Commit | Change | Categories |
|---|---|---|
| `5df0f10` | Next.js 14 → 15.5.28 and patched transitive packages (dependency vulnerabilities; on `main`) | 17, 18 |
| `d1c6067` | Async `searchParams` on activity, segments, reports, feedback-inbox and settings/security (on `main`) | 18 |
| `3acc7fe` | Every migration (twice) plus an RLS suite (now 49 assertion statements) on real PostgreSQL 16, in CI. Fixed `0009` on fresh databases; `0045` revokes anonymous `EXECUTE` on `import_apply_visits`, drops a hard-coded default and adds the migration ledger and `rls_status()` | 16, 19, 24 |
| `5b7276d` | Static drift check of code and `database.types.ts` against the migrated schema | 12, 20 |
| `abaa530` | Unsubscribe no longer triggered by link scanners; CSP violation reporting; same-origin guard on cookie-authenticated route handlers | 25, 26, 32 |
| `55d3e73` | TOTP two-factor, `/account/security` (password, sessions, sign out elsewhere), an organisation "require 2FA" policy, admin reset, shared password policy | 21, 22 |
| `0c96733` | Per-customer export and erasure (GDPR), audit of all configuration changes, best-effort audit writes | 29, 31 |
| `a0de429` | `/security`, `/subprocessors`, `security.txt`, `SECURITY.md` | 34, 37 |
| `44ae523` | Launch readiness console, boot-time config check, request ids on errors | 38, 43 |
| `c683617` | WCAG 2.1 AA on all public pages (40 failures → 0) with a CI audit; lazy charts; streamed dashboard | 5, 6, 45 |
| `9955685` | Cron senders claim each send (no duplicates from overlapping runs), idempotency keys, FIFO batches within a time budget, race test, backlog check | 40, 46 |
| `935f7e3` | The Admin Portal requires a two-factor session | 30 |

---

## 5. Code review

Defects found and fixed during this audit:

| Finding | Where | Effect before the fix | Fix |
|---|---|---|---|
| Overlapping cron runs sent the same emails twice | `src/app/api/send-messages/route.ts`, `src/app/api/send-review-requests/route.ts` | A test of two overlapping runs on the old code sent 8 emails for 4 messages | `claimDue` lease, `releaseClaims`, idempotency keys (`9955685`) |
| A failure after a successful send was recorded as a failed send | same routes (one `try` around send, journey advance and `notifyOwner`) | A message already delivered could be retried (second email) or marked `failed` | Post-send steps isolated; failure updates apply only while `status = 'pending'` |
| One unordered batch of 50 per run | same routes | With the daily schedule, at most 50 of each per day across all businesses, in arbitrary order | Oldest first, batches of 25 until 45 s pass |
| `GET` unsubscribe changed data | `src/app/api/unsubscribe/[customerId]/route.ts` | Security scanners that open links unsubscribed customers | `GET` confirms, `POST` acts (`abaa530`) |
| `recordAudit` created its client outside `try` | `src/lib/audit.ts` | An audit failure could fail the user's action | Client created inside `try`; `auditAsCurrentUser` also catches |
| Migration `0009` hard-coded an organisation id | `supabase/migrations/0009_demo_company_db.sql` | Failed on any fresh database | Conditional insert; `0045` drops the default |
| Reset form allowed 6-character passwords | reset password form | Weaker than sign-up | Shared `checkPassword` |
| Team page looked members up one by one | `listTeam`, `src/lib/team.ts` | Slow with large teams | Parallel lookups |
| Admin Portal reachable with a password-only session | `src/middleware.ts`, `src/app/(app)/admin/` | One phished password exposed every tenant | `adminAccess()` requires `aal2` (`935f7e3`) |

Open review items (not defects; documented so they are decided rather than forgotten):

| Item | Where | Recommendation |
|---|---|---|
| Customer list loads every row | `src/app/(app)/customers/page.tsx:47` (`fetchAll`) | Server pagination and search; fine below a few thousand customers |
| Owner email looked up per business | `src/app/(app)/dashboard/admin-businesses-table.tsx` | Operator-only page; batch when there are hundreds of organisations |
| Hand-written database types | `src/lib/database.types.ts` | Generate in CI; the drift check covers the gap until then |
| Large modules | `src/lib/customers.ts`, `src/app/(app)/dashboard/page.tsx` | Split when next edited |
| `select('*')` in the cron routes | send routes | Narrow the columns when the routes next change |

---

## 6. UX review

Evidence-based observations (the signed-in UI was reviewed by reading code, as no browser session with data was
possible here):

- **Accessibility and contrast.**
  - Every public page passes WCAG 2.1 AA automated checks in light, dark and phone views (`scripts/a11y-audit.mjs`).
  - The light-theme secondary text tokens (`--ink-3`, `--ink-4`) and white-on-brand buttons (`bg-brand-600` →
    `bg-brand-700`) were the main failures and are fixed.
- **Security flows are plain-English and recoverable.**
  - `/mfa` accepts codes typed with spaces (`normaliseTotpCode`) and returns the user to where they were going (`gateRedirect`).
  - The last authenticator cannot be removed while two-factor is required (`MfaPanel`).
  - Staff who lose a device can be reset by an admin (`ResetMfaButton`).
- **Destructive actions confirm by name.** Customer erasure requires typing the customer's name (`eraseCustomer`
  `confirmName`), and the result is announced (`/customers?erased=1`).
- **Unsubscribe is respectful.** A confirmation page in the business's own name, with no marketing, `noindex`
  (`src/lib/unsubscribe-page.ts`).
- **Friction to fix:**
  1. One login per business (#50) forces multi-site owners to juggle accounts.
  2. No in-app help (#2).
  3. The default theme is dark for everyone (light only through the toggle, stored as `pentriq-theme`). Owners
     reading on a phone in a bright salon may prefer light. Consider following the system setting.
  4. A send can take up to a day with the default schedule (#40). Explain the timing in the UI until H7 is done.

---

## 7. Security audit and findings report

Method:

- line review of authentication, authorisation, tenant isolation, request integrity, secrets, sending,
  unsubscribe and admin code;
- the RLS suite and the claim race test on PostgreSQL 16;
- `npm audit`;
- header review of `next.config.mjs`.

No live penetration test was performed. The production project was not accessible.

| ID | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| S-01 | High | No two-factor authentication anywhere | `main` at `dfaf1db`: no MFA code | **Fixed** `55d3e73` |
| S-02 | High | Admin Portal (all tenants, through the service role) accepted a password-only session | `src/middleware.ts`, `src/app/(app)/admin/layout.tsx`, `src/lib/admin-guard.ts` | **Fixed** `935f7e3` |
| S-03 | Medium | `GET` unsubscribe link changed consent, so link scanners unsubscribed people | `src/app/api/unsubscribe/[customerId]/route.ts` | **Fixed** `abaa530` |
| S-04 | Medium | Cookie-authenticated `POST` route handlers had no origin check (CSRF) | `api/send-review-request`, `api/send-rebooking-reminder` | **Fixed**: `src/lib/same-origin.ts` |
| S-05 | Medium | CSP violations never collected; no enforced CSP directives | `next.config.mjs` | **Partly fixed**: minimal CSP enforced, full CSP report-only with `/api/csp-report`. Promotion is H11 |
| S-06 | Medium | Configuration and integration changes were not audited | `src/lib/audit.ts` call sites | **Fixed** `0c96733` |
| S-07 | Medium | No account-level session controls (password change, sign out elsewhere) | `src/app/account/security/` | **Fixed** `55d3e73` |
| S-08 | Medium | Sign-in has no CAPTCHA; throttling is Supabase's alone | `signInWithPassword`, `src/components/auth-form.tsx` | **Open**: H16 |
| S-09 | Medium | No independent penetration test | **Not evidenced in codebase.** | **Open**: H21 |
| S-10 | Low | Anonymous role could `EXECUTE` `import_apply_visits` (SECURITY INVOKER, so RLS still applied and nothing was readable; defence in depth) | `0039`; caught by `rls.test.sql` | **Fixed** `0045` |
| S-11 | Low | Reset password accepted 6 characters | reset form; `src/lib/password-policy.ts` | **Fixed** |
| S-12 | Low | A failing audit write could fail the user's action (availability) | `recordAudit` | **Fixed** |
| S-13 | Low | `demo_company_records.business_id` defaulted to one real organisation's id | `0009`, `0045` | **Fixed** |
| S-14 | Low | No disclosure policy or `security.txt` | `SECURITY.md`, `/.well-known/security.txt` | **Fixed** `a0de429` |
| S-15 | Low | Lost-device recovery for a sole owner needs operator action (no recovery codes) | `src/lib/mfa.ts` | **Open**: prompt for a second authenticator |
| S-16 | Low | 4 low-severity advisories in production dependencies (`resend` → `@react-email/render`) | `npm audit --omit=dev` | **Open**: no non-breaking fix |
| S-17 | Low | Any member of a business can write `messages` and `loyalty_ledger_entries` directly | `supabase/schema.sql` policies | **Accepted**: within one tenant, matches staff capabilities |
| S-18 | Low | Operator identity is an environment variable allow-list | `src/lib/admin-access.ts` | **Accepted**, with S-02's two-factor requirement |
| S-19 | Info | Encryption key rotation not documented | `src/lib/google-token-crypto.ts` | **Open** |

No critical findings. No cross-tenant data access path was found: the RLS suite checks anonymous, non-member,
cross-tenant and every role.

---

## 8. Performance audit

Measured with `next build` (Next.js 15.5.28) on this branch:

| Route | Route JS | First load | Note |
|---|---|---|---|
| shared by all | — | 170 kB | |
| `/` | 1.16 kB | 182 kB | |
| `/dashboard` | 2.86 kB | 194 kB | Intelligence sections stream in `<Suspense>`; KPIs and chart render first |
| `/reviews` | 5.44 kB | 184 kB | Was 112 kB / 291 kB before lazy charts |
| `/customers` | 8.88 kB | 188 kB | Server work grows with the customer count (`fetchAll`) |
| `/reports` | 5.81 kB | 179 kB | |
| `/insights` | 193 B | 191 kB | |
| `/account/security` | 5.74 kB | 254 kB | Browser Supabase client and QR enrolment |
| middleware | — | 147 kB | |

Server-side:

- `getAuthUser` verifies the JWT locally (`getClaims`) with no Auth round trip, memoised per request (`cache`).
- `loadBusiness` fetches membership and business in one query.
- `loadIntelligence` makes 13 queries, memoised per request.
- The cron senders now process up to 20 batches of 25 per run, rather than one batch of 50.

Not measured: Core Web Vitals in production and load testing (**Not evidenced in codebase**). Vercel Speed
Insights or a k6 script would close this.

---

## 9. Reassessment

| | Before | After |
|---|---|---|
| Headline release readiness (UK SMB self-serve) | **4/10** | **7/10** |
| Mean of 50 categories | 4.6 | 6.5 |
| Enterprise readiness (section 2 benchmark) | 2/10 | 3/10 |
| Jest test suites | 66 on `main` | 73, with 835 tests, all passing |
| Database proof | none | 45 migrations twice + RLS suite + race test + drift check, in CI |
| Accessibility | 40 serious or critical failures | 0, in CI |
| Dependency advisories (`npm audit`) | 1 critical, 2 high, 27 moderate, 5 low before the Next.js 15 upgrade (`docs/PRODUCT_AUDIT.md` §13) | Production: 4 low, nothing higher. All dependencies: 7 low, 17 moderate (dev-only) |

**Evidence for 7:**
- Every code-side blocker found in this audit is fixed with a test: duplicate sends, scanner unsubscribes,
  missing two-factor, operator access, CSRF, audit gaps and accessibility.
- Tenant isolation is proven on a real database on every change.
- Configuration mistakes are caught by `/admin/readiness` before customers see them.

**Why not 9 yet:**
- Legal documents are drafts and there is no DPA.
- Payment has not been tested live.
- Sends are daily.
- Nobody is alerted when the site is down.
- Backups are unverified.
- Signed-in journeys have no E2E tests.

**Path to 9:**
- Do the Critical and High human actions → **8/10**.
- Add the signed-in E2E suite and server pagination for `/customers`, then two clean weeks in production
  (CSP promoted, no Sentry regressions) → **9/10**.

**Remaining engineering improvements, in order:**
1. Playwright E2E for signed-in flows against `supabase start` on GitHub Actions (#15).
2. Server pagination and search for `/customers` (#46).
3. Prompt for a second authenticator or recovery method at enrolment (S-15).
4. CAPTCHA on sign-in, sign-up and reset with `captchaToken` (S-08, needs H16).
5. Multi-business membership and a workspace switcher (#50).
6. Generated database types in CI (#12).
7. Consent-aware product analytics (#9).
8. React 19; Tailwind 4 as a planned migration (#17, #18).

**Risks:**
- The admin two-factor requirement takes effect on deploy, so operators must set up two-factor on first visit
  to `/admin` (H2).
- Migration `0045` must be applied before the organisation 2FA switch can be saved (H1).
- Until H7, review requests go out once a day.

**Branches:**
- The Next.js 15 upgrade reached `main` through PR #7, with Dependabot's transitive security fixes. This
  branch is rebased on it and carries everything else above.
- Every other branch is already in `main`. That includes Dependabot's grouped branch, which PR #7 merged with
  its Tailwind 4 bump left out: Tailwind stays on 3.4.13, because Tailwind 4 changes the configuration model and
  breaks the app's styling. Tailwind 4 needs a planned migration.

---

## Human actions required

Each item needs access, money, a legal judgement or a business decision that the repository cannot provide.

| # | Exact action | Why Claude cannot do it | Business impact | Priority |
|---|---|---|---|---|
| H1 | Run `supabase/migrations/0045_hardening_and_mfa_policy.sql` in the production Supabase SQL editor, then open `/admin/readiness` and confirm "Migration 0045" and "Row-level security on every table" are green | No access to the production database | Organisation 2FA policy, hardening revokes and the live RLS check depend on it | Critical |
| H2 | Straight after deploying, sign in to each `ADMIN_EMAIL` account, open `/admin`, set up two-factor when prompted, and add a second authenticator | Needs the operators' phones | The Admin Portal is unusable until done; a single lost device locks the operator out | Critical |
| H3 | Have a UK solicitor review `/terms`, `/privacy` and `/cookies` (and retention defaults) | Legal advice | Taking payment on draft terms is a contractual and regulatory risk | Critical |
| H4 | Publish a UK GDPR Article 28 data processing agreement for business customers | Legal document | Required by law for a processor; business buyers will ask | Critical |
| H5 | Confirm the processing region and transfer mechanism for each sub-processor (Supabase project region, Vercel, Resend, Stripe, Sentry, Google, Twilio) and update `src/lib/subprocessors.ts` | Account settings and contracts are outside the repository | Accuracy of the privacy notice; buyer questionnaires | High |
| H6 | Switch Stripe to live keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_IDS`, `STRIPE_WEBHOOK_SECRET`), register the live webhook, then make a real £19 payment, cancel and refund it | Needs the Stripe dashboard and a real card | No revenue until proven | Critical |
| H7 | Call `/api/send-messages` and `/api/send-review-requests` every 5 minutes with `Authorization: Bearer <CRON_SECRET>` (Vercel Pro cron, or cron-job.org on Hobby) | Account and billing decision | Requests currently go out up to a day after the visit | High |
| H8 | Add an uptime monitor on `https://<your domain>/api/health` that alerts a phone out of hours | Third-party account | Outages go unnoticed | High |
| H9 | Set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` and create alert rules for new issues in `cron:send-messages`, `cron:send-review-requests` and `stripe:webhook` | Sentry account | Silent failures in sending and billing | High |
| H10 | Confirm the Supabase plan's backups (daily or point-in-time), then restore a backup into a scratch project once and record how long it took | Supabase dashboard and billing | Unknown recovery time after data loss | High |
| H11 | After 7 days of production traffic, review `security/csp_violation` logs; if only expected sources appear, move the report-only policy in `next.config.mjs` to the enforced header | Needs production traffic data | Full XSS protection | Medium |
| H12 | On a staging Supabase project, walk through sign-up → onboarding → CSV import → review request → click → private feedback → billing with real inboxes and a phone | Needs real accounts; the Supabase local images could not be pulled here | Catches integration issues before customers do | High |
| H13 | Get Google Business Profile API access approved, publish the OAuth consent screen, then set `GOOGLE_BUSINESS_API_APPROVED=true` | Google's review process | Review sync, replies and alerts stay "coming soon" until then | High |
| H14 | Create a Twilio account with a UK sender, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`, and send one test SMS | Account and phone number | SMS and WhatsApp stay simulated | Medium |
| H15 | Once DMARC reports show SPF and DKIM aligned for pentriq.cloud, raise the DMARC policy from `p=none` to `p=quarantine`, then `p=reject` | DNS access | Stops spoofing of your domain; improves inbox placement | Medium |
| H16 | Enable CAPTCHA (Cloudflare Turnstile or hCaptcha) in Supabase Auth and supply the site key, so `captchaToken` can be added to the auth forms | Third-party keys plus a product decision on friction | Brute-force and sign-up abuse protection | Medium |
| H17 | In Supabase Auth settings, review session timebox / inactivity timeout, auth rate limits and leaked-password protection | Supabase dashboard | Common security-questionnaire items | Medium |
| H18 | Commit response targets in `SECURITY.md` (for example: acknowledge in 3 working days, fix critical issues in 7) and make sure hello@pentriq.cloud is watched | Business commitment | Researchers and buyers expect stated timelines | Medium |
| H19 | Decide whether and when to pursue SOC 2 / ISO 27001 and SSO (enterprise segment) | Purchase and strategy | Needed only for enterprise deals | Low now |
| H20 | Decide pricing: annual plan, and a multi-location tier | Business policy | Expansion revenue | Medium |
| H21 | Commission an independent penetration test before scaling or before the first larger customer | Purchase | Independent assurance for security reviews | Medium |
| H22 | Register with the ICO and pay the data protection fee, if not already done | Legal and payment | UK legal requirement for organisations processing personal data | High |
| H23 | Decide when to schedule the Tailwind 4 migration, and keep Tailwind 4 out of Dependabot merges until then (version updates already ignore it in `.github/dependabot.yml`; security updates can still propose it, as the grouped one in PR #7 did) | Product and engineering prioritisation | Avoids a broken-styling merge | Low |
| H24 | Write a one-page incident runbook (who is called, how customers are told) and decide on a status page | Business process | Faster, calmer incident handling | Medium |
