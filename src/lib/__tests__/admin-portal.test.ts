import { afterEach, describe, expect, it } from '@jest/globals';
import { isAdminEmail } from '@/lib/admin-access';
import { classifyEmail, filterActivity, normalizeStatus, parseRange, parseResendEmail, parseResendUsage, toWindow, usageTone, usageWarnings } from '@/lib/admin-usage';
import { notifyEmailSent, onEmailSent } from '@/lib/email-events';

const SAMPLE = {
  object: 'usage',
  emails: {
    daily: { used: 3, limit: 100, sent: 3, received: 0, resets_at: '2026-10-22T00:00:00.000Z' },
    monthly: { used: 295, limit: 3000, sent: 295, received: 0, resets_at: '2026-11-01T00:00:00.000Z' },
  },
};

describe('admin access', () => {
  const original = process.env.ADMIN_EMAIL;
  afterEach(() => { process.env.ADMIN_EMAIL = original; });
  it('only lets listed emails in, case-insensitively', () => {
    process.env.ADMIN_EMAIL = 'Boss@x.com, other@x.com';
    expect(isAdminEmail('boss@X.com')).toBe(true);
    expect(isAdminEmail('stranger@x.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
  it('denies everyone when ADMIN_EMAIL is unset', () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdminEmail('boss@x.com')).toBe(false);
  });
});

describe('Resend usage parsing', () => {
  it('maps the Usage API response to the summary shape', () => {
    const u = parseResendUsage(SAMPLE)!;
    expect(u).toMatchObject({ emailsSentToday: 3, dailyLimit: 100, dailyRemaining: 97, dailyPercentage: 3, emailsSentThisMonth: 295, monthlyLimit: 3000, monthlyRemaining: 2705, source: 'resend' });
    expect(u.monthlyPercentage).toBeCloseTo(9.8, 1);
  });
  it('treats a null limit as unlimited, not zero or 100%', () => {
    const u = parseResendUsage({ emails: { daily: { used: 5, limit: null }, monthly: { used: 50, limit: null } } })!;
    expect(u.dailyLimit).toBeNull();
    expect(u.dailyPercentage).toBeNull();
    expect(usageTone(u.dailyPercentage)).toBe('grey');
  });
  it('caps percentage at 100 and rejects malformed bodies', () => {
    expect(toWindow(150, 100).percentage).toBe(100);
    expect(toWindow(-5, 100).used).toBe(0);
    expect(parseResendUsage(null)).toBeNull();
    expect(parseResendUsage({ emails: {} })).toBeNull();
    expect(parseResendUsage('nonsense')).toBeNull();
  });
});

describe('status colours and warnings', () => {
  it('green under 70, amber 70-90, red 90+', () => {
    expect([0, 69.9, 70, 89.9, 90, 100].map(usageTone)).toEqual(['green', 'green', 'amber', 'amber', 'red', 'red']);
  });
  it('warns above 80% and goes critical near exhaustion', () => {
    expect(usageWarnings({ dailyPercentage: 50, monthlyPercentage: 10 })).toEqual([]);
    expect(usageWarnings({ dailyPercentage: 85, monthlyPercentage: null })).toEqual([{ level: 'warning', message: 'Warning: Daily email limit above 80%.' }]);
    expect(usageWarnings({ dailyPercentage: 10, monthlyPercentage: 97 })).toEqual([{ level: 'critical', message: 'Critical: Monthly email limit almost exhausted.' }]);
  });
});

describe('email activity', () => {
  const now = new Date('2026-10-21T15:00:00Z');
  const item = (id: string, createdAt: string, last_event: string, subject = 'Welcome to Pentriq') =>
    parseResendEmail({ id, created_at: createdAt, to: ['a@x.com'], subject, last_event })!;
  const items = [
    item('1', '2026-10-21T09:00:00Z', 'delivered'),
    item('2', '2026-10-18T09:00:00Z', 'bounced'),
    item('3', '2026-09-30T09:00:00Z', 'delivered'),
  ];
  it('filters by range and status', () => {
    expect(filterActivity(items, 'today', 'all', now).map((i) => i.id)).toEqual(['1']);
    expect(filterActivity(items, '7d', 'all', now).map((i) => i.id)).toEqual(['1', '2']);
    expect(filterActivity(items, '30d', 'all', now).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(filterActivity(items, '30d', 'failed', now).map((i) => i.id)).toEqual(['2']);
    expect(filterActivity(items, '30d', 'successful', now).map((i) => i.id)).toEqual(['1', '3']);
  });
  it('tolerates missing fields and classifies templates', () => {
    expect(parseResendEmail({})).toBeNull();
    expect(parseResendEmail({ id: 'x', created_at: '2026-01-01T00:00:00Z' })).toMatchObject({ recipient: '\u2014', template: 'Other' });
    expect(classifyEmail('Welcome to Pentriq')).toBe('Welcome');
    expect(classifyEmail('Refer a Friend and Get Rewarded')).toBe('Referral');
    expect(normalizeStatus('complained').status).toBe('failed');
    expect(parseRange('bogus')).toBe('7d');
  });
});

describe('send events', () => {
  it('notifies listeners and survives a throwing listener', () => {
    let calls = 0;
    const off1 = onEmailSent(() => { throw new Error('bad'); });
    const off2 = onEmailSent(() => { calls += 1; });
    notifyEmailSent();
    off1();
    notifyEmailSent();
    off2();
    notifyEmailSent();
    expect(calls).toBe(2);
  });
});
