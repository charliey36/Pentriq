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
