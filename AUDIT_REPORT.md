# Pentriq platform hardening report

Scope: static review of the code paths below plus automated tests (`npm test`: 460 passing). Nothing was
tested against a live Supabase project, a real browser, Resend or Stripe, so those parts are marked
"not verified" where relevant.

## Fixed in this pass

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 1 | Security (open redirect) | `/auth/callback?next=` redirected to any URL (`//evil.com`, `https://evil.com`) after login | `safeNextPath()` (`src/lib/safe-redirect.ts`) allows only same-site paths |
| 2 | Security (IDOR / tenant isolation) | Logging a visit trusted the browser's `customerId` and `serviceId`, so a visit could be written against another business's customer or service; loyalty redemption did the same for `customerId` | Both now confirm the customer (and service) belong to the signed-in business |
| 3 | Security (info leak) | 12 server actions showed raw database/provider errors to users | `userSafeError()` logs the real cause server-side and shows a friendly message |
| 4 | Security (sensitive logging) | Email send logs wrote full recipient addresses; SMS stub logged message bodies | Structured logger masks emails, drops secrets and tokens, logs body length only |
| 5 | Security (headers) | No baseline security headers | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in `next.config.mjs` |
| 6 | Import | A single database error aborted the whole import ("Import failed: <db text>") | `bulkImportWithRecovery`: retries in chunks of 50, then row by row; bad rows are reported as skipped, the rest import |
| 7 | Import | Only comma-separated files worked; semicolon (European Excel), tab and pipe files failed to map | Delimiter detection on the header line |
| 8 | Import | A file with an unclosed quote silently swallowed all following rows; binary files were parsed as text | Both rejected with a plain-English message |
| 9 | Import | Header "Appointment" (text) was mapped to **date** because fields were matched in a fixed order | Global best-score-first assignment across all fields |
| 10 | Import | Limited service synonyms | Weighted dictionary (`SERVICE_SYNONYMS`): Service/Treatment/Appointment 68-70, Booking/Job/Session/Package ~56-62, Product/Work ~48-52, Task/Description/Transaction 42-44. Multi-word headers use the strongest word minus a discount |
| 11 | Import UI | Low-confidence guesses were not called out | "We think this matches your <field> field. Please check it is right." on every non-high match; mapping is always shown for confirmation, never silently applied |
| 12 | Import UI | No headline result | "Imported: N, Skipped: N, Warnings: N" |
| 13 | Validation | Visit price had no upper bound; notes unbounded | Price 0 to 1,000,000; notes 1,000 characters |
| 14 | Observability | Ad-hoc `console.log` lines | `src/lib/log.ts` `logEvent(area, event, fields)` JSON lines; wired into email sends, referral create/redeem, CSV import, test email |

## Checked and found sound (no change)
- Tenant scoping on customer, message, feedback, review and referral mutations (`business_id` filter on every update/delete).
- Admin-only actions re-check admin status server-side.
- No user HTML reaches the DOM: the only `dangerouslySetInnerHTML` uses are JSON-LD (with `<` escaped) and a static theme script. Email templates escape interpolated values.
- Public endpoints already use the rate limiter (migration 0024); cron endpoints use a constant-time secret check.
- Supabase queries are parameterised through the client (no string-built SQL found).

## Known weaknesses not fixed (need a decision or a database change)
1. **Import is not a single database transaction.** A failure between "update customer totals" and "insert visits" followed by a retry can double-count a returning customer's spend/visit totals. Proper fix: move the import write phase into one Postgres function (RPC).
2. **No CSP header.** Needs testing against Stripe, Sentry and Google scripts before enabling.
3. **Referral QR codes use api.qrserver.com**, which sends the referral link (containing the code) to a third party. Generating the QR locally would remove this.
4. **Loyalty "Save" button** (moved to page bottom) has no spinner and can be double-clicked; saving is idempotent so it is harmless.
5. **Import row cap is 2,000 rows / 2 MB.** 100k-row files are rejected with a clear message (parsing 120k rows is tested and fast); raising the cap needs background processing.
6. **Referred-customer points reward is recorded but not credited**: redeeming a code does not record who the referred customer is.
7. **Send-time safety if URLs are empty** for pre-existing businesses falls back to `/review-unavailable` rather than blocking sends.
8. Not verified: account creation, password reset, workspace creation/switching and Stripe flows were reviewed only through existing tests, not exercised end to end. Only the areas listed under "Fixed" were deeply audited.

## Tests added
`platform-hardening.test.ts`, extra cases in `import-bulk.test.ts`, `csv-import-mapping.test.ts`: empty/blank/ragged CSVs, 120k rows, delimiters, BOM/CRLF, unclosed quotes, binary files, duplicate re-import, no-email/no-service/future-dated rows, simulated DB failure and total outage, open-redirect payloads, hostile settings values, log masking, email escaping and fallbacks.
