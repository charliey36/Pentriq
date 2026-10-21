import { describe, expect, it } from '@jest/globals';
import { cooldownDaysFor, isCooldownActive } from '@/lib/eligibility';

describe('review request cooldown', () => {
  const sent = '2026-01-01T09:00:00Z';
  it('follows the 60-day example', () => {
    expect(isCooldownActive(sent, 60, '2026-01-20')).toBe(true);
    expect(isCooldownActive(sent, 60, '2026-02-15')).toBe(true);
    expect(isCooldownActive(sent, 60, '2026-03-10')).toBe(false);
  });
  it('allows exactly the cooldown length (elapsed >= period)', () => {
    expect(isCooldownActive(sent, 60, '2026-03-02')).toBe(false);
    expect(isCooldownActive(sent, 60, '2026-03-01')).toBe(true);
  });
  it('never blocks a customer who has not been sent a request', () => {
    expect(isCooldownActive(null, 60, '2026-01-02')).toBe(false);
  });
  it('is off unless enabled', () => {
    expect(cooldownDaysFor({})).toBeNull();
    expect(cooldownDaysFor({ review_cooldown_enabled: false, review_cooldown_days: 30 })).toBeNull();
    expect(cooldownDaysFor({ review_cooldown_enabled: true, review_cooldown_days: 30 })).toBe(30);
  });
});

import { reviewSendTime } from '@/lib/send-window';

describe('review send time follows the review request window', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  it('defaults to 8am the next day', () => {
    expect(reviewSendTime('2026-03-05', now).toISOString()).toBe('2026-03-06T08:00:00.000Z');
  });
  it('sends N days after the service when N is set', () => {
    expect(reviewSendTime('2026-03-05', now, 3).toISOString()).toBe('2026-03-08T08:00:00.000Z');
  });
});
