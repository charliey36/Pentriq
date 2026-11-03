/**
 * Launch readiness: can this deployment safely take real customers? Checks configuration (environment variables)
 * here, and the live database (migrations, row-level security) in the admin console that calls this.
 *
 * Reports only whether each item is present and plausible, never a value, so the output is safe to show in the
 * admin portal and to write to logs.
 */

export type Severity = 'blocker' | 'recommended' | 'optional';
export type CheckStatus = 'ok' | 'warn' | 'fail';

export type ReadinessCheck = {
  id: string;
  area: 'Core' | 'Email' | 'Billing' | 'Security' | 'Monitoring' | 'Integrations' | 'Database';
  label: string;
  severity: Severity;
  status: CheckStatus;
  detail: string;
};

type Env = Record<string, string | undefined>;

const set = (v: string | undefined) => typeof v === 'string' && v.trim().length > 0;

function check(id: string, area: ReadinessCheck['area'], label: string, severity: Severity, ok: boolean, okDetail: string, failDetail: string, warn = false): ReadinessCheck {
  return { id, area, label, severity, status: ok ? (warn ? 'warn' : 'ok') : severity === 'optional' ? 'warn' : 'fail', detail: ok ? okDetail : failDetail };
}

/** Base64 that decodes to exactly 32 bytes (AES-256 key). */
export function isAes256Key(raw: string | undefined): boolean {
  if (!set(raw)) return false;
  try {
    return Buffer.from(raw!.trim(), 'base64').length === 32;
  } catch {
    return false;
  }
}

export function evaluateConfig(env: Env, opts: { production: boolean } = { production: env.NODE_ENV === 'production' }): ReadinessCheck[] {
  const out: ReadinessCheck[] = [];
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() ?? '';
  const appUrlOk = /^https:\/\//.test(appUrl) && !/localhost|127\.0\.0\.1/.test(appUrl);

  out.push(check('supabase', 'Core', 'Supabase connection', 'blocker',
    set(env.NEXT_PUBLIC_SUPABASE_URL) && set(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) && set(env.SUPABASE_SERVICE_ROLE_KEY),
    'URL, public key and service key are set.', 'Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.'));
  out.push(check('app-url', 'Core', 'Public app URL', 'blocker',
    opts.production ? appUrlOk : set(appUrl) || true,
    appUrlOk ? 'HTTPS public URL set; email links and OAuth callbacks use it.' : 'Development value in use.',
    'NEXT_PUBLIC_APP_URL must be the public https:// address, or email links and sign-in callbacks break.'));
  out.push(check('cron', 'Core', 'Scheduled jobs secret', 'blocker',
    set(env.CRON_SECRET),
    (env.CRON_SECRET?.trim().length ?? 0) >= 32 ? 'Set and long enough.' : 'Set, but shorter than 32 characters: generate a longer one.',
    'CRON_SECRET is missing: review requests, reminders and retention will not run.',
    (env.CRON_SECRET?.trim().length ?? 0) < 32));

  const from = env.EMAIL_FROM?.trim() ?? '';
  out.push(check('resend', 'Email', 'Email delivery (Resend)', 'blocker', set(env.RESEND_API_KEY),
    'API key set.', 'RESEND_API_KEY is missing: no email is sent (sends are only logged).'));
  out.push(check('email-from', 'Email', 'Sender address on your own domain', 'blocker',
    set(from) && !/resend\.dev/i.test(from),
    'Sending from your domain (check SPF, DKIM and DMARC pass, as in your DMARC reports).',
    'EMAIL_FROM is unset or on resend.dev: mail goes from Resend’s sandbox and most of it will not arrive.'));
  out.push(check('admin', 'Security', 'Operator access', 'recommended', set(env.ADMIN_EMAIL),
    'ADMIN_EMAIL set: the admin portal is reachable.', 'Set ADMIN_EMAIL so someone can reach the admin portal and this checklist.'));

  const stripeKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const priceSet = set(env.STRIPE_PRICE_IDS) || set(env.STRIPE_PRICE_ID);
  out.push(check('stripe', 'Billing', 'Payments (Stripe)', 'blocker',
    set(stripeKey) && priceSet && set(env.STRIPE_WEBHOOK_SECRET) && set(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    opts.production && stripeKey.startsWith('sk_test_') ? 'Configured, but with TEST keys: real cards will not be charged.' : 'Keys, price and webhook secret set.',
    'Set STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_IDS and STRIPE_WEBHOOK_SECRET to take payment.',
    opts.production && stripeKey.startsWith('sk_test_')));

  out.push(check('encryption-key', 'Security', 'Token encryption key', 'recommended', isAes256Key(env.GOOGLE_TOKEN_ENCRYPTION_KEY),
    'Valid 32-byte key: Google, booking-system and webhook secrets are encrypted at rest.',
    'GOOGLE_TOKEN_ENCRYPTION_KEY is missing or not 32 bytes of base64 (openssl rand -base64 32). Webhooks and Google/booking connections need it.'));
  out.push(check('sentry', 'Monitoring', 'Error monitoring (Sentry)', 'recommended', set(env.SENTRY_DSN) || set(env.NEXT_PUBLIC_SENTRY_DSN),
    'Errors are reported.', 'Set SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN so production errors reach you before customers do.'));

  out.push(check('google', 'Integrations', 'Google Business Profile', 'optional',
    set(env.GOOGLE_CLIENT_ID) && set(env.GOOGLE_CLIENT_SECRET) && env.GOOGLE_BUSINESS_API_APPROVED === 'true',
    'Configured and marked approved.', 'Not live: review sync, replies and alerts show "coming soon" until Google approves the project and GOOGLE_BUSINESS_API_APPROVED=true.'));
  out.push(check('sms', 'Integrations', 'SMS and WhatsApp (Twilio)', 'optional',
    set(env.TWILIO_ACCOUNT_SID) && set(env.TWILIO_AUTH_TOKEN) && set(env.TWILIO_FROM_NUMBER),
    'Configured.', 'Not configured: text messages are logged, not sent.'));
  out.push(check('ai', 'Integrations', 'AI reply drafts (Gemini)', 'optional', set(env.GEMINI_API_KEY),
    'Configured.', 'Not configured: "Draft with AI" is hidden. Everything else in Insights works without it.'));
  if (set(env.BILLING_OVERRIDE_EMAILS)) {
    const n = env.BILLING_OVERRIDE_EMAILS!.split(',').filter((s) => s.trim()).length;
    out.push({ id: 'billing-override', area: 'Billing', label: 'Free-access accounts', severity: 'recommended', status: 'warn', detail: `${n} email${n === 1 ? '' : 's'} bypass billing (BILLING_OVERRIDE_EMAILS). Keep this to your own accounts.` });
  }
  return out;
}

/**
 * Scheduled sends more than a day past due. vercel.json runs the send jobs once a day, so a send can wait up to a
 * day by design; beyond that the jobs are not running, or are failing.
 */
export const SEND_OVERDUE_HOURS = 26;

export function sendBacklogCheck(overdue: number | null): ReadinessCheck {
  const base = { id: 'send-backlog', area: 'Core' as const, label: 'Scheduled sends keeping up', severity: 'recommended' as const };
  if (overdue === null) return { ...base, status: 'warn', detail: 'Could not count overdue sends.' };
  if (overdue === 0) return { ...base, status: 'ok', detail: `Nothing more than ${SEND_OVERDUE_HOURS} hours overdue.` };
  return {
    ...base,
    status: 'warn',
    detail: `${overdue.toLocaleString('en-GB')} review requests and messages are more than ${SEND_OVERDUE_HOURS} hours overdue. The send jobs are failing (Sentry area cron:send-messages / cron:send-review-requests) or not running often enough: call /api/send-messages and /api/send-review-requests every 5 minutes from Vercel Pro cron or an external scheduler.`,
  };
}

export type ReadinessSummary = { blockers: number; warnings: number; ok: number; ready: boolean };

export function summarise(checks: ReadinessCheck[]): ReadinessSummary {
  const blockers = checks.filter((c) => c.status === 'fail' && c.severity === 'blocker').length;
  const warnings = checks.filter((c) => c.status === 'warn' || (c.status === 'fail' && c.severity !== 'blocker')).length;
  return { blockers, warnings, ok: checks.filter((c) => c.status === 'ok').length, ready: blockers === 0 };
}

/**
 * Objects each recent migration creates, probed through the API to tell which migrations a database has.
 * From 0045 on, migrations also record themselves in public.schema_migrations.
 */
export const MIGRATION_SENTINELS: Array<{ migration: string; table: string; column: string; feature: string }> = [
  { migration: '0039', table: 'audit_log', column: 'id', feature: 'Audit log and atomic CSV import' },
  { migration: '0040', table: 'businesses', column: 'widget_enabled', feature: 'Industries and review widget' },
  { migration: '0041', table: 'team_invitations', column: 'id', feature: 'Team invitations and roles' },
  { migration: '0043', table: 'webhook_endpoints', column: 'id', feature: 'Outbound webhooks' },
  { migration: '0044', table: 'saved_views', column: 'id', feature: 'Saved views, retention, staff-proof config' },
  { migration: '0045', table: 'businesses', column: 'require_mfa', feature: 'Two-factor policy and hardening' },
];
