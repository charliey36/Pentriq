import { isBlockedTestEmail, isExpectedEmailValidationError } from '../test-email';
import { filterAndScrub } from '../sentry-options';
import { rebookingLink, validateBookingUrl } from '../booking-url';

describe('isBlockedTestEmail', () => {
  it.each(['example.com', 'test@example.com', 'a@example.org', 'a@sub.example.net', 'a@foo.test', 'a@localhost', 'A@EXAMPLE.COM'])(
    'blocks %s',
    (e) => expect(isBlockedTestEmail(e)).toBe(true)
  );
  it.each(['jane@gmail.com', 'bob@mybusiness.co.uk', 'a@notexample.com', '', null])('allows %s', (e) =>
    expect(isBlockedTestEmail(e as string | null)).toBe(false)
  );
});

describe('Sentry beforeSend filter', () => {
  const resendMsg = "Invalid 'to' field. Please use our testing email address instead of domains like example.com.";
  it('drops the Resend test-domain error', () => {
    expect(isExpectedEmailValidationError(resendMsg)).toBe(true);
    expect(filterAndScrub({ type: undefined, exception: { values: [{ value: resendMsg }] } } as never)).toBeNull();
  });
  it('keeps genuine failures', () => {
    expect(isExpectedEmailValidationError('Resend API timeout')).toBe(false);
    expect(filterAndScrub({ message: 'Resend API timeout' } as never)).not.toBeNull();
  });
});

describe('booking url', () => {
  it('validates', () => {
    expect(validateBookingUrl('')).toBeNull();
    expect(validateBookingUrl('https://business.com/book')).toBeNull();
    expect(validateBookingUrl('javascript:alert(1)')).not.toBeNull();
    expect(validateBookingUrl('nope')).not.toBeNull();
  });
  it('links directly to the business, falling back to Pentriq', () => {
    expect(rebookingLink({ booking_url: 'https://b.com/book' }, 'c1', 'https://app')).toBe('https://b.com/book');
    expect(rebookingLink({ booking_url: null }, 'c1', 'https://app')).toBe('https://app/book/c1');
  });
});
