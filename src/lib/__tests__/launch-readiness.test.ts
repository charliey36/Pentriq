/** @jest-environment node */
import { evaluateConfig, isAes256Key, summarise } from '../launch-readiness';

const KEY = Buffer.alloc(32, 9).toString('base64');
const ready = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-public',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secret-value',
  NEXT_PUBLIC_APP_URL: 'https://pentriq.cloud',
  CRON_SECRET: 'c'.repeat(40),
  RESEND_API_KEY: 're_secret',
  EMAIL_FROM: 'hello@pentriq.cloud',
  ADMIN_EMAIL: 'ops@pentriq.cloud',
  STRIPE_SECRET_KEY: 'sk_live_secret',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_x',
  STRIPE_PRICE_IDS: 'price_1',
  STRIPE_WEBHOOK_SECRET: 'whsec_secret',
  GOOGLE_TOKEN_ENCRYPTION_KEY: KEY,
  SENTRY_DSN: 'https://k@o.ingest.sentry.io/1',
};

const byId = (checks: ReturnType<typeof evaluateConfig>) => Object.fromEntries(checks.map((c) => [c.id, c]));

describe('launch readiness configuration checks', () => {
  it('is ready with a complete production configuration and never echoes values', () => {
    const checks = evaluateConfig(ready, { production: true });
    expect(summarise(checks)).toMatchObject({ ready: true, blockers: 0 });
    const text = JSON.stringify(checks);
    for (const secret of ['service-secret-value', 're_secret', 'sk_live_secret', 'whsec_secret', KEY, 'c'.repeat(40)]) {
      expect(text).not.toContain(secret);
    }
  });

  it('blocks on the classic go-live mistakes', () => {
    const c = byId(evaluateConfig({ ...ready, EMAIL_FROM: 'onboarding@resend.dev', NEXT_PUBLIC_APP_URL: 'http://localhost:3000', CRON_SECRET: '', RESEND_API_KEY: '' }, { production: true }));
    expect(c['email-from'].status).toBe('fail');
    expect(c['app-url'].status).toBe('fail');
    expect(c.cron.status).toBe('fail');
    expect(c.resend.status).toBe('fail');
  });

  it('warns about test-mode Stripe keys and short secrets in production', () => {
    const c = byId(evaluateConfig({ ...ready, STRIPE_SECRET_KEY: 'sk_test_x', CRON_SECRET: 'short' }, { production: true }));
    expect(c.stripe.status).toBe('warn');
    expect(c.cron.status).toBe('warn');
  });

  it('treats optional integrations as warnings, not blockers', () => {
    const checks = evaluateConfig(ready, { production: true });
    const c = byId(checks);
    expect(c.google.status).toBe('warn');
    expect(c.sms.severity).toBe('optional');
    expect(summarise(checks).ready).toBe(true);
  });

  it('validates the AES-256 key length and flags billing overrides', () => {
    expect(isAes256Key(KEY)).toBe(true);
    expect(isAes256Key(Buffer.alloc(16).toString('base64'))).toBe(false);
    expect(isAes256Key(undefined)).toBe(false);
    const c = byId(evaluateConfig({ ...ready, BILLING_OVERRIDE_EMAILS: 'a@x.co, b@x.co' }, { production: true }));
    expect(c['billing-override'].detail).toMatch(/^2 emails bypass billing/);
    expect(c['billing-override'].detail).not.toContain('a@x.co');
  });
});
