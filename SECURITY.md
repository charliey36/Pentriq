# Security policy

## Reporting a vulnerability

Email **hello@pentriq.cloud** with the subject "Security report", including:

- what you found and where (URL, endpoint or file),
- steps to reproduce,
- the impact you believe it has.

Please do not access, change or delete other people's data, run denial-of-service tests, or test with social
engineering. Give us reasonable time to fix an issue before disclosing it publicly. The same contact is published at
`/.well-known/security.txt` (RFC 9116) and on the public `/security` page.

## Supported versions

Only the current production deployment (the `main` branch) is supported.

## How Pentriq is protected (summary for reviewers)

| Area | Control | Where |
|---|---|---|
| Tenant isolation | Row-level security on every table; ~60 isolation and role tests run against PostgreSQL on every change | `supabase/migrations/`, `supabase/tests/rls.test.sql`, `scripts/verify-db.sh`, CI job `database` |
| Authorisation | Owner / admin / staff capability matrix in the app, plus restrictive database policies on configuration tables | `src/lib/permissions.ts`, migration `0044` |
| Authentication | Supabase Auth; TOTP two-factor with organisation-wide enforcement, verified-token gate, admin reset; shared password policy | `src/lib/mfa.ts`, `src/lib/business.ts`, `src/app/account/security/` |
| Operator access | Admin Portal limited to `ADMIN_EMAIL` accounts with a two-factor (aal2) session, checked in middleware, the portal layout, admin API routes and every admin action | `src/lib/admin-access.ts`, `src/middleware.ts`, `src/lib/admin-guard.ts` |
| Scheduled sends | Each send claimed with a conditional update before it goes out, plus per-attempt email idempotency keys: overlapping cron runs never double-send | `src/lib/send-claim.ts`, `supabase/tests/claim-race.sh` |
| Secrets at rest | AES-256-GCM for OAuth tokens and webhook secrets; SHA-256 for API keys and invitation tokens; hashed IPs in the audit log | `src/lib/google-token-crypto.ts`, `src/lib/api-keys.ts`, `src/lib/team.ts`, `src/lib/audit.ts` |
| Web hardening | Enforced CSP (object-src, base-uri, frame-ancestors) plus a full report-only policy with violation reporting; HSTS, nosniff, frame and referrer policies, COOP | `next.config.mjs`, `src/app/api/csp-report/` |
| Request integrity | Same-origin checks on cookie-authenticated route handlers; OAuth `state` validation; safe redirects | `src/lib/same-origin.ts`, `src/lib/safe-redirect.ts` |
| Abuse | Database-backed rate limits on public endpoints | `src/lib/rate-limit.ts` |
| Outbound requests | Webhooks: HTTPS only, private and metadata addresses blocked (literal and resolved), no redirects, HMAC-SHA256 signatures | `src/lib/webhooks.ts` |
| Audit | Append-only audit log of security and configuration changes, owner/admin viewer and CSV export | `src/lib/audit.ts`, `/settings/security` |
| Data rights | Business and per-customer export, customer erasure, retention policy, suppression list, RFC 8058 unsubscribe | `src/lib/customer-privacy.ts`, `src/lib/retention.ts`, `src/app/api/unsubscribe/` |
| Supply chain | `npm audit --omit=dev --audit-level=high` blocks CI; read-only CI token; CodeQL code scanning on pull requests (GitHub default setup); Dependabot | `.github/workflows/ci.yml`, `.github/dependabot.yml` |

Known gaps are tracked in `docs/RELEASE_READINESS.md`.
