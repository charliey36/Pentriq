import { describe, expect, it } from '@jest/globals';
import { REVIEW_LINK_REQUIRED_MESSAGE, reviewLinkBlockedReason } from '@/lib/send-guards';

const ready = { google_review_url: 'https://g.page/r/abc', name: 'Harbor Barbers' };

describe('reviewLinkBlockedReason', () => {
  it('holds review requests and reminders when there is no review link', () => {
    for (const purpose of ['review_request', 'review_reminder']) {
      for (const url of ['', '   ', null, undefined]) {
        expect(reviewLinkBlockedReason({ ...ready, google_review_url: url }, purpose)).toBe(REVIEW_LINK_REQUIRED_MESSAGE);
      }
    }
  });
  it('holds review requests while the business still has the placeholder or an empty name', () => {
    for (const name of ['My Business', '', '  ', null, undefined]) {
      expect(reviewLinkBlockedReason({ ...ready, name }, 'review_request')).toBe(REVIEW_LINK_REQUIRED_MESSAGE);
    }
  });
  it('allows review messages once the link and name are set', () => {
    expect(reviewLinkBlockedReason(ready, 'review_request')).toBeNull();
    expect(reviewLinkBlockedReason(ready, 'review_reminder')).toBeNull();
  });
  it('never blocks message types that do not need a review link', () => {
    for (const purpose of ['rebooking_reminder', 'win_back', 'birthday', 'referral', 'loyalty']) {
      expect(reviewLinkBlockedReason({ google_review_url: '', name: 'My Business' }, purpose)).toBeNull();
    }
  });
});
