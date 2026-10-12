import { describe, expect, it } from '@jest/globals';
import { CONSENT_FIELD, hasConsent } from '@/lib/consent';

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  Object.entries(entries).forEach(([k, v]) => fd.set(k, v));
  return fd;
};

describe('consent confirmation', () => {
  it('is only true when the box is ticked', () => {
    expect(hasConsent(form({ [CONSENT_FIELD]: 'on' }))).toBe(true);
    expect(hasConsent(form({}))).toBe(false);
    expect(hasConsent(form({ [CONSENT_FIELD]: 'off' }))).toBe(false);
    expect(hasConsent(form({ [CONSENT_FIELD]: 'true' }))).toBe(false);
  });
});
