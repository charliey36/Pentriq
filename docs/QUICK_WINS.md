# Quick wins release notes

Apply `supabase/migrations/0037_quick_wins.sql` before (or with) the deploy. The app tolerates the migration being late:
new columns are read with defaults, and Settings saves fall back to the old columns if a new one is missing.

New cron jobs (already in `vercel.json`, protected by `CRON_SECRET`):

| Route | Schedule | Purpose |
|---|---|---|
| `/api/send-weekly-summary` | Mondays 08:30 UTC | Weekly performance email to owners (opt out in Settings) |
| `/api/send-milestones` | Daily 10:00 UTC | One-off activation emails (first import, 20 requests, first review, 10 reviews) |

Behaviour notes

- Existing businesses: reminders stay on, the frequency limit stays off, and milestone emails are pre-marked as sent so nobody receives "first import" emails for old activity. New businesses default to a 30-day frequency limit.
- Weekly summary emails start for existing businesses on the first Monday after deploy.
- "Reviews completed" on the dashboard counts customers who followed the review link. Pentriq cannot read inside Google.
- Pausing a subscription pauses Stripe collection (`pause_collection`, invoices voided), stops all sending, and cancels scheduled-but-unsent review messages so nothing fires in a burst on resume.
- Estimated value on the pause screen is `customers who followed the link × £25` (`ESTIMATED_VALUE_PER_REVIEW` in `src/lib/pause.ts`). Review-gap calculator capture rates (3% vs 8%) are illustrative and live in `src/lib/review-gap.ts`.
