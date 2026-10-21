# Stripe setup and test checklist

Pentriq has **one plan** (see `PLAN` in `src/lib/billing.ts`: £19/month, 30-day free trial with no card).
Stripe is wired into the existing Settings → Billing page; nothing about the plan, price or page layout changed.

## How it fits together

| Piece | Where |
| --- | --- |
| Plan, trial state, feature gating (`canUse`, `sendBlockedReason`) | `src/lib/billing.ts` |
| Stripe client + price ids | `src/lib/stripe.ts` |
| Upgrade (Checkout) and Manage billing (Customer Portal) actions | `src/app/(app)/settings/billing/actions.ts` |
| Return-from-Checkout sync, card summary, invoices | `src/app/(app)/settings/billing/stripe-data.ts` |
| Webhook route (signature-verified, idempotent) | `src/app/api/stripe/webhook/route.ts` |
| Event handlers + Stripe→app status mapping | `src/lib/stripe-sync.ts` |
| Tables | migration `0022_stripe_subscriptions.sql` (`subscriptions`, `stripe_webhook_events`) |

`businesses.subscription_status / current_period_end / stripe_*` (migration 0005) remain what the app reads for access;
webhooks write those **and** the fuller `subscriptions` row.

### Access tiers
- **Free (always):** viewing data, settings, billing, feedback inbox, reputation tracking.
- **Trial (30 days from signup) and Paid (`active`, `past_due`):** everything that sends customer messages.
- **Blocked (trial ended, canceled):** manual sends return "Your free trial has ended…"; scheduled jobs defer
  affected rows by a day (not cancelled, so they resume after subscribing).
`past_due` keeps access while Stripe retries the card.

### Trial
Already existed (`businesses.trial_ends_at`, default now()+14 days (legacy default; trial is now opt-in, 30 days); countdown banner in the app layout and Billing page).
If a user subscribes mid-trial and ≥2 days remain, the remaining trial is carried into Stripe (`trial_end`), so the first charge
happens when the trial would have ended.

### Upgrade / downgrade
There is a single plan, so there is nothing to up/downgrade between. Subscribe, update card, cancel, resume and
invoices all go through the Customer Portal. If you add more plans later, add their prices to `STRIPE_PRICE_IDS`,
extend `PLAN`/`planNameForPrice`, and enable plan switching in the portal configuration.

## Environment variables

| Variable | Notes |
| --- | --- |
| `STRIPE_SECRET_KEY` | Server-only. Dashboard → Developers → API keys. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` of the endpoint below (or from `stripe listen`). |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Not used by hosted Checkout today; set for future use. |
| `STRIPE_PRICE_IDS` | Comma-separated price ids; first one is used for new checkouts. `STRIPE_PRICE_ID` (single) still works. |
| `NEXT_PUBLIC_APP_URL` | Used for success/cancel/return URLs. |

## Setup
1. Run `supabase/migrations/0022_stripe_subscriptions.sql` in the Supabase SQL editor.
2. Stripe (start in **test mode**): Products → create "Pentriq", recurring price £19 / month GBP. Copy the `price_…` id into `STRIPE_PRICE_IDS`.
3. Settings → Billing → Customer portal: enable *update payment method*, *cancel subscription*, *invoice history*; **save** (the portal fails until saved once).
4. Webhooks → add endpoint `{NEXT_PUBLIC_APP_URL}/api/stripe/webhook` with events:
   `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
   Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
5. Set the env vars locally (`.env.local`) and in Vercel; redeploy.
6. Local webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (use the `whsec_` it prints).

## Test checklist (Stripe test mode)
- [ ] **Signup / trial start:** new account → Billing shows "Free trial", 30 days left; banner shows countdown.
- [ ] **Checkout:** click Subscribe → Stripe-hosted page opens with £19/month. Cancel → back on Billing with "Checkout cancelled".
- [ ] **Successful payment:** card `4242 4242 4242 4242` → returns to Billing with "subscription is active"; `subscriptions` and `businesses` rows updated; payment method + invoice appear (invoice appears after the trial if one was carried over).
- [ ] **Failed payment:** subscribe with `4000 0000 0000 0341` (attaches, then fails on charge) or use a test clock to advance; `invoice.payment_failed` → status "Payment failed" (`past_due`); access retained.
- [ ] **Recovery:** update card in the portal and pay the invoice → `invoice.paid` → status back to Active.
- [ ] **Cancellation:** portal → Cancel → Billing says "set to cancel… access continues until"; at period end (`stripe trigger customer.subscription.deleted` or test clock) → "Canceled", sends blocked.
- [ ] **Plan change / card update:** portal → update card → Billing card summary refreshes.
- [ ] **Portal access:** Manage billing opens the portal and returns to Billing; invoices/receipts downloadable.
- [ ] **Webhook processing:** `stripe events resend <id>` twice → second is a no-op (`stripe_webhook_events`); bad signature → 400.
- [ ] **Enforcement:** expired trial (set `trial_ends_at` in the past) → Send now returns the subscription message; cron endpoints defer rows (`next_attempt_at` +1 day).

Automated: `npx jest src/lib/__tests__/stripe-billing.test.ts` covers status mapping, price-id parsing and access rules.
Webhook/Checkout/Portal flows need a live Stripe test account and were **not** exercised end to end here.
