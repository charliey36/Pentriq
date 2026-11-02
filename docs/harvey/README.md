# Using Harvey to find Pentriq customers

[Harvey](https://github.com/ethanplusai/harvey) is an open-source autonomous outreach agent. It finds businesses, writes cold email, sends it from your mailbox and handles replies. `harvey.pentriq.yaml` in this folder is a ready configuration for selling Pentriq to UK local service businesses. It loads cleanly with Harvey's own config loader. Harvey itself has not been run.

## Why this has to run on your machine
Harvey runs a loop on the computer you control, uses your own logged-in Claude (or Codex) subscription, and sends from your own mailbox. It cannot be run for you from a cloud session: there is no persistent process, no access to your subscription login, and no mailbox credentials.

## Setup
1. Get a **dedicated sending domain** (not `pentriq.cloud`), a mailbox on it, and a warmup service. Set SPF, DKIM and DMARC. Warm up for 2 to 4 weeks before real volume.
2. Install Harvey (needs Python 3.11+, and the Claude CLI logged in):
   ```bash
   git clone https://github.com/ethanplusai/harvey.git
   cd harvey
   python3.13 -m venv .venv && source .venv/bin/activate && pip install -e .
   cp .env.example .env
   ```
3. Copy `docs/harvey/harvey.pentriq.yaml` from this repo to `harvey/harvey.local.yaml`, then fill in every `CHANGE ME` (your name, sending address, warmup start date, postal address, meeting owner).
4. Add your mailbox credentials to Harvey's `.env` (see its `.env.example`), then run `harvey warmup`. Wait for READY.
5. Run `harvey signals --confirm free`, `harvey discover`, then `harvey dashboard` and `harvey run`.
6. Keep `require_approval: true`. Read every email in the Outbox before approving it.

## Read before you send anything
- **UK law (PECR).** Cold email to **sole traders and ordinary partnerships** generally needs their prior consent. Emailing **limited companies** is more permissive but still needs a clear sender identity, a working opt-out and a defensible reason. Many salons, barbers, groomers and tradespeople are sole traders. The config turns on Harvey's Precleared check for this, but you remain the sender and responsible. Consider asking a solicitor, or restricting to limited companies.
- **Postal address and identity** must appear in each cold email; Harvey adds them from the config.
- **Your subscription's terms.** Harvey drives your Claude subscription from an unattended loop. Check Anthropic's current usage terms and limits for that use before relying on it.
- Start at 10 to 20 emails a day and watch bounces (stop above about 3%).
- Never claim features Pentriq does not have. Review-sync and reply features depend on Google approving the Business Profile API for your project.
