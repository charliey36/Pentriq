# Pentriq branding notes

Pentriq is the product name everywhere in the codebase. The single source of truth is
[`src/lib/brand.ts`](./src/lib/brand.ts) (`APP_NAME`, wordmark parts, tagline/description,
storage keys, `senderDisplayName()`). A regression test (`src/lib/__tests__/brand.test.ts`)
fails if the product's previous name reappears in source, docs, migrations or root markdown.

## Where the name comes from `brand.ts`
Root layout metadata (title template, description, OpenGraph, Twitter card), billing plan name,
logo wordmarks (`Logo`, `LogoOnDark`, dashboard preview), review request/reminder email header and
footer, welcome / campaign / trial-ending notification emails, "`{business}` via Pentriq" sender
names, email configuration test emails, browser storage keys.

Long-form prose (landing page, Terms, Privacy, how-it-works, integration docs, settings help text,
documentation) is written as plain "Pentriq" text on purpose so it stays easy to edit.

## Naming conventions
| Thing | Value |
| --- | --- |
| Product / application name | Pentriq |
| Slug (package name, storage keys, identifiers) | `pentriq` |
| Repository / folder name | `pentriq` (this app lives in `pentriq-rebuild/`) |
| Demo login (seed default) | `demo@pentriq.app` |
| Integration test-import sample email | `test@pentriq.local` |

## Data notes
- No table, column or customer record was changed by the rebrand.
- Databases seeded before the rename may still contain a demo user with the previous demo address.
  Demo-mode detection is based on "demo" appearing in the address, so it still behaves as a demo
  account. Delete it manually, or run the seed with `SEED_DEMO_EMAIL=<that address>` to keep using it.
- Browser preferences (theme, sidebar state, dismissed setup checklist) are stored under new
  `pentriq-*` keys, so each browser starts fresh once.

## Manual actions (outside this repository)
1. **Logo assets** (see below) – the mark is still the original paper-plane.
2. **Supabase Auth emails** (confirm signup, password reset, magic link, invite): templates live in the
   Supabase dashboard (*Authentication → Emails*). Update the product name there and the SMTP sender name.
3. **Resend**: set `EMAIL_FROM` on a verified Pentriq domain.
4. **Stripe**: new checkouts use the product name "Pentriq" (`PLAN.name`). Rename the existing Stripe
   product and hosted-portal branding.
5. **Hosting (Vercel)**: rename the project, update the domain and `NEXT_PUBLIC_APP_URL`, and the cron
   job URLs that call the `/api/*` endpoints.
6. **GitHub**: rename the remote repository to `pentriq` and update `origin` (`git remote set-url`).
7. **Third-party consoles**: Zapier/Make zaps, OAuth consent screens and saved webhook names.

## Files needing new Pentriq logo assets
| File | Current state |
| --- | --- |
| `public/logo-mark.svg` | Original paper-plane mark, green `#188038`. Needs the Pentriq mark. |
| `public/logo-horizontal.svg` | Wordmark text is "Pentriq" (placeholder two-tone "Pentr" + "iq"); paper-plane mark. |
| `public/logo-stacked.svg` | Same as above; also has the old tagline "REACH · REQUEST · REVIEW". |
| `src/app/icon.svg` | **Favicon** – paper-plane. |
| `src/components/logo.tsx` (`PlaneIcon`, `LogoMark`) | In-app logo mark (header, sidebar, auth, legal pages). |
| `src/app/email-assets/logo-mark.png/route.tsx` | Generates the PNG logo mark used in email headers/footers. Swap the SVG path/gradient, or serve a static PNG. |
| `src/lib/email.ts` | Notification-email wordmark uses the old green `#188038`. |
| *(missing)* | No OpenGraph/Twitter share image, apple-touch-icon or PWA icons – add `src/app/opengraph-image.png`, `apple-icon.png`, etc. |

The wordmark renders "Pentr" + accent "iq" (`APP_NAME_LEAD` / `APP_NAME_ACCENT` in `brand.ts`).
Change those if the final logo is single-tone.
