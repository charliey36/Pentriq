import { describe, expect, it } from '@jest/globals';
import { renderReviewRequestEmail } from '../email-templates/review-request';
import { PLACEHOLDER_REVIEW_URL, resolveReviewLink } from '../email-templates/review-destinations';
import { renderMessage } from '../templates';
import { buildReviewRequestEmail } from '../email';

const base = {
  customerName: 'Alex Morgan',
  businessName: 'Acme Coffee',
  reviewLink: 'https://app.test/api/track-message/m1?x=1&y=2',
  privateFeedbackUrl: 'https://app.test/feedback/m1',
  unsubscribeUrl: 'https://app.test/api/unsubscribe/c1',
  appUrl: 'https://app.test',
};

describe('renderReviewRequestEmail', () => {
  it('renders the branded hero, CTA, supporting copy and trust footer', () => {
    const { html, subject } = renderReviewRequestEmail(base);
    expect(subject).toBe('How was your visit to Acme Coffee?');
    expect(html).toContain('Thank you for choosing Acme Coffee');
    expect(html).toContain("Hi Alex, we'd love to hear about your experience.");
    expect(html).toContain('Leave a Review');
    expect(html).toContain('href="https://app.test/api/track-message/m1?x=1&amp;y=2"');
    expect(html).toContain('helps other customers make informed decisions');
    expect(html).not.toContain('Review request');
    expect(html).toContain('Sent on behalf of');
    expect(html).not.toContain('Friendly reminder');
    expect(html).toContain('Sent via Pentriq');
    expect(html).toContain('https://app.test/email-assets/logo-mark.png');
  });

  it('is email-safe: table layout, viewport meta, VML button for Outlook, no scripts', () => {
    const { html } = renderReviewRequestEmail(base);
    expect(html).toContain('background-color:#070b14');
    expect(html).toContain('background-color:#0f1726');
    expect(html).toContain('linear-gradient(135deg,#101c31 0%,#12344b 58%,#075b50 100%)');
    expect(html).toContain('rgba(34,201,138,0.85)');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<v:roundrect');
    expect(html).toContain('role="presentation"');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<svg/i);
  });

  it('always includes the private feedback link alongside the public review link', () => {
    const { html, text } = renderReviewRequestEmail(base);
    expect(html).toContain('href="https://app.test/feedback/m1"');
    expect(text).toContain('https://app.test/feedback/m1');
  });

  it('falls back gracefully when variables are missing', () => {
    const { html, subject, text } = renderReviewRequestEmail({
      privateFeedbackUrl: base.privateFeedbackUrl,
      appUrl: '',
    });
    expect(subject).toBe('How was your recent visit?');
    expect(html).toContain('Thank you for choosing us');
    expect(html).toContain('Hi there,');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
    expect(text).toContain('Hi there,');
    // logo resolves relative to the host app in preview
    expect(html).toContain('src="/email-assets/logo-mark.png"');
  });

  it('promotes private feedback to the primary action when there is no review link', () => {
    const { html } = renderReviewRequestEmail({ ...base, reviewLink: null });
    expect(html).not.toContain('Leave a Review');
    expect(html).toContain('Share Your Feedback');
    expect(html).not.toContain('Send private feedback');
  });

  it('rejects non-http(s) links instead of putting them in an href', () => {
    const { html } = renderReviewRequestEmail({ ...base, reviewLink: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:');
  });

  it('escapes HTML in customer and business names', () => {
    const { html } = renderReviewRequestEmail({
      ...base,
      customerName: '<img src=x onerror=alert(1)>',
      businessName: '<b>Bad & Co</b>',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Bad');
    expect(html).toContain('&lt;b&gt;Bad &amp; Co&lt;/b&gt;');
  });

  it('renders the reminder variant', () => {
    const { html, subject } = renderReviewRequestEmail({ ...base, variant: 'reminder' });
    expect(subject).toBe("We'd still love to hear from you — Acme Coffee");
    expect(html).toContain("We'd still love to hear from you");
    expect(html).not.toContain('Review request');
    expect(html).not.toContain('Friendly reminder');
  });

  it('renders optional contact details and platform note', () => {
    const { html } = renderReviewRequestEmail({
      ...base,
      reviewPlatform: 'trustpilot',
      businessContact: { email: 'hello@acme.co', phone: '020 7946 0000' },
    });
    expect(html).toContain('mailto:hello@acme.co');
    expect(html).toContain('tel:02079460000');
    expect(html).toContain('Opens Trustpilot');
  });
});

describe('review destinations', () => {
  it('only uses the placeholder when explicitly asked', () => {
    expect(resolveReviewLink({ url: null })).toBeNull();
    expect(resolveReviewLink({ url: 'nope' }, { usePlaceholder: true })).toBe(PLACEHOLDER_REVIEW_URL);
    expect(resolveReviewLink({ url: 'https://g.page/r/abc/review' })).toBe('https://g.page/r/abc/review');
  });

  it('renders rebooking in the shared premium layout without workflow labels', () => {
    const { html, subject, text } = renderReviewRequestEmail({
      variant: 'rebooking',
      customerName: 'Alex Morgan',
      businessName: 'Acme Coffee',
      rebookingLink: 'https://app.test/book/alex',
      unsubscribeUrl: base.unsubscribeUrl,
      appUrl: base.appUrl,
    });
    expect(subject).toBe('Ready for your next visit to Acme Coffee?');
    expect(html).toContain('Ready for your next visit?');
    expect(html).toContain('Book Your Next Appointment');
    expect(html).toContain('href="https://app.test/book/alex"');
    expect(html).toContain('role="presentation"');
    expect(html).not.toMatch(/Review Request|Rebooking Reminder|Reminder Email|Automated Reminder/i);
    expect(text).toContain('https://app.test/book/alex');
  });
});

describe('send pipeline integration', () => {
  it('renderMessage uses the new template for review requests and reminders', () => {
    const ctx = {
      businessName: 'Acme Coffee',
      customerName: 'Alex Morgan',
      publicReviewUrl: base.reviewLink,
      privateFeedbackUrl: base.privateFeedbackUrl,
      unsubscribeUrl: base.unsubscribeUrl,
    };
    const request = renderMessage('review_request', 'email', ctx);
    expect(request.html).toContain('Thank you for choosing Acme Coffee');
    expect(request.html).toContain('Unsubscribe');
    const reminder = renderMessage('review_reminder', 'email', ctx);
    expect(reminder.subject).toContain("We'd still love to hear from you");
  });

  it('renderMessage still enforces the private feedback invariant', () => {
    expect(() =>
      renderMessage('review_request', 'email', {
        businessName: 'Acme',
        customerName: 'Alex',
        publicReviewUrl: base.reviewLink,
        privateFeedbackUrl: '',
      })
    ).toThrow(/Compliance violation/);
  });

  it('SMS output is unchanged (no HTML)', () => {
    const sms = renderMessage('review_request', 'sms', {
      businessName: 'Acme',
      customerName: 'Alex',
      publicReviewUrl: base.reviewLink,
      privateFeedbackUrl: base.privateFeedbackUrl,
    });
    expect(sms.html).toBeUndefined();
    expect(sms.text).toContain(base.privateFeedbackUrl);
  });

  it('legacy buildReviewRequestEmail uses the new template', () => {
    const email = buildReviewRequestEmail({
      businessName: 'Acme Coffee',
      customerName: 'Alex Morgan',
      trackingUrl: 'https://app.test/api/track/r1',
      unsubscribeUrl: base.unsubscribeUrl,
    });
    expect(email.html).toContain('Leave a Review');
    expect(email.text).toContain('https://app.test/api/track/r1');
  });
});
