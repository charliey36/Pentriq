import { describe, expect, it } from '@jest/globals';
import { normalizeContactEmail, renderSupportFooter } from '@/lib/email-templates/support-footer';
import { renderReviewRequestEmail } from '@/lib/email-templates/review-request';
import { renderMessage } from '@/lib/templates';
import { buildNotificationEmail } from '@/lib/email';
import { parseSettingsForm } from '@/lib/settings-validation';

const base = { customerName: 'Sam', businessName: 'Bright Smile', reviewLink: 'https://r.test/x', privateFeedbackUrl: 'https://p.test/f', unsubscribeUrl: 'https://u.test/x' };

describe('shared support footer', () => {
  it('renders the business address as "Need help?" and nothing else', () => {
    const f = renderSupportFooter('support@brightsmile.com');
    expect(f.html).toContain('Need help?');
    expect(f.html).toContain('mailto:support@brightsmile.com');
    expect(f.text).toBe('Need help? support@brightsmile.com');
  });
  it.each([null, undefined, '', '   ', 'not-an-email', 'a@b', 'x@y.com<script>', 'a b@c.com'])('renders nothing for %p', (v) => {
    expect(renderSupportFooter(v)).toEqual({ html: '', text: '' });
  });
  it('escapes the address', () => {
    expect(normalizeContactEmail('o"x@y.com')).toBeNull();
  });
});

describe.each(['request', 'reminder', 'rebooking'] as const)('review email (%s)', (variant) => {
  const withContact = renderReviewRequestEmail({ ...base, variant, rebookingLink: 'https://b.test/b', businessContact: { email: 'help@bs.com' } });
  const without = renderReviewRequestEmail({ ...base, variant, rebookingLink: 'https://b.test/b' });
  it('shows the business address when set', () => {
    expect(withContact.html).toContain('Need help?');
    expect(withContact.html).toContain('mailto:help@bs.com');
    expect(withContact.text).toContain('Need help? help@bs.com');
  });
  it('removes the whole section when not set, and never shows a Pentriq address', () => {
    expect(without.html).not.toContain('Need help?');
    expect(without.text).not.toContain('Need help?');
    expect(without.html + without.text).not.toMatch(/@pentriq/i);
  });
  it('a changed address shows up immediately', () => {
    const changed = renderReviewRequestEmail({ ...base, variant, rebookingLink: 'https://b.test/b', businessContact: { email: 'new@bs.com' } });
    expect(changed.html).toContain('new@bs.com');
    expect(changed.html).not.toContain('help@bs.com');
  });
});

describe('other customer emails use the same footer', () => {
  const ctx = { businessName: 'Bright Smile', customerName: 'Sam', unsubscribeUrl: 'https://u.test/x', referralCode: 'ABC', loyaltyPointsBalance: 5 };
  it.each(['win_back', 'birthday', 'referral', 'loyalty'] as const)('%s', (purpose) => {
    expect(renderMessage(purpose, 'email', { ...ctx, contactEmail: 'help@bs.com' }).html).toContain('mailto:help@bs.com');
    const none = renderMessage(purpose, 'email', ctx).html ?? '';
    expect(none).not.toContain('Need help?');
    expect(none).not.toMatch(/@pentriq/i);
  });
  it('review request via renderMessage', () => {
    const html = renderMessage('review_request', 'email', { ...ctx, publicReviewUrl: 'https://r.test/x', privateFeedbackUrl: 'https://p.test/f', contactEmail: 'help@bs.com' }).html;
    expect(html).toContain('mailto:help@bs.com');
  });
  it('owner-facing Pentriq notifications are unaffected', () => {
    expect(buildNotificationEmail('campaign', 'Acme').html).toContain('Just reply to this email');
  });
});

describe('contact email setting', () => {
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    Object.entries({ name: 'Acme', google_review_url: 'https://g.page/x', booking_url: 'https://a.com/b', review_request_window_days: '2', rebooking_reminder_interval_days: '30', ...o }).forEach(([k, v]) => f.set(k, v));
    return f;
  };
  it('is optional and stored as null when blank', () => {
    const r = parseSettingsForm(fd({}));
    expect(r.ok && r.values.contact_email).toBeNull();
    const blank = parseSettingsForm(fd({ contact_email: '   ' }));
    expect(blank.ok && blank.values.contact_email).toBeNull();
  });
  it('saves a valid address (trimmed) and rejects an invalid one', () => {
    const ok = parseSettingsForm(fd({ contact_email: ' support@acme.com ' }));
    expect(ok.ok && ok.values.contact_email).toBe('support@acme.com');
    const bad = parseSettingsForm(fd({ contact_email: 'nope' }));
    expect(bad).toMatchObject({ ok: false, field: 'contact_email' });
  });
});
