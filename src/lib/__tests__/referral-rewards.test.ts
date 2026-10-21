import { describe, expect, it } from '@jest/globals';
import { formatReward, parseRewardFields } from '@/lib/referral-rewards';
import { renderWelcomeEmail } from '@/lib/email-templates/welcome';

function form(entries: Record<string, string>) {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}

describe('referral rewards', () => {
  it('formats points and custom rewards', () => {
    expect(formatReward('points', 100, '')).toBe('100 Loyalty Points');
    expect(formatReward('points', 1, '')).toBe('1 Loyalty Point');
    expect(formatReward('custom', null, '  £10 Off First Visit ')).toBe('£10 Off First Visit');
  });

  it('parses a points reward', () => {
    const r = parseRewardFields(form({ referrer_type: 'points', referrer_points: '100' }), 'referrer', 'Referrer reward');
    expect(r).toEqual({ reward: { type: 'points', points: 100, label: '100 Loyalty Points' } });
  });

  it('parses a custom reward and ignores stale points', () => {
    const r = parseRewardFields(form({ customer_type: 'custom', customer_text: 'Free Haircut', customer_points: '5' }), 'customer', 'Referred customer reward');
    expect(r).toEqual({ reward: { type: 'custom', points: null, label: 'Free Haircut' } });
  });

  it('rejects bad input with a readable error', () => {
    expect(parseRewardFields(form({ referrer_type: 'points', referrer_points: '0' }), 'referrer', 'Referrer reward')).toHaveProperty('error');
    expect(parseRewardFields(form({ referrer_type: 'points', referrer_points: '1.5' }), 'referrer', 'Referrer reward')).toHaveProperty('error');
    expect(parseRewardFields(form({ customer_type: 'custom', customer_text: '  ' }), 'customer', 'Referred customer reward')).toHaveProperty('error');
  });
});

describe('welcome email', () => {
  it('renders the onboarding sections', () => {
    const { subject, html, text } = renderWelcomeEmail({ businessName: 'Bright <Smile>' });
    expect(subject).toBe('Welcome to Pentriq');
    for (const s of ['Welcome to Pentriq', 'Import Customers', 'Configure Loyalty Program', 'Create Referral Promotions', 'Invite Customers', 'Open Pentriq Dashboard', 'hello@pentriq.cloud', 'width=device-width']) {
      expect(html).toContain(s);
    }
    expect(html).toContain('Bright &lt;Smile&gt;');
    expect(html).not.toContain('Bright <Smile>');
    expect(text).toContain('hello@pentriq.cloud');
  });
});
