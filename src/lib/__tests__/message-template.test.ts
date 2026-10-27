import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_BODY,
  SAMPLE_VALUES,
  formatAppointmentDate,
  missingValues,
  renderTemplateText,
  resolveValues,
  unknownVariables,
  validateTemplate,
} from '@/lib/message-template';
import { renderReviewRequestEmail } from '@/lib/email-templates/review-request';

describe('message template validation', () => {
  it('accepts supported variables and plain text', () => {
    expect(validateTemplate('How was {{serviceName}}?', 'Hi {{customerName}}, thanks from {{businessName}}. {{staffName}} on {{appointmentDate}}.')).toEqual({ ok: true });
  });
  it('flags unknown variables (typos)', () => {
    expect(unknownVariables('Hi {{custmerName}} and {{ businessName }}')).toEqual(['custmerName']);
    const r = validateTemplate('', 'Hi {{custmerName}}');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toMatch(/custmerName/);
  });
  it('flags unfinished braces, links and over-long text', () => {
    expect(validateTemplate('', 'Hi {{customerName').ok).toBe(false);
    expect(validateTemplate('', 'Hi {customerName}').ok).toBe(false);
    expect(validateTemplate('', 'Go to https://evil.example').ok).toBe(false);
    expect(validateTemplate('x'.repeat(121), '').ok).toBe(false);
    expect(validateTemplate('', 'x'.repeat(601)).ok).toBe(false);
  });
});

describe('fallbacks', () => {
  it('uses readable defaults for missing values, never empty text', () => {
    const v = resolveValues({ customerName: '  ', serviceName: null });
    expect(v).toMatchObject({ customerName: 'there', serviceName: 'recent service', staffName: 'our team', appointmentDate: 'your recent visit', businessName: 'us' });
    expect(renderTemplateText('Hi {{customerName}}, thanks for your {{serviceName}}', {})).toBe('Hi there, thanks for your recent service');
  });
  it('reports which used variables have no real value', () => {
    expect(missingValues('Hi {{customerName}} {{staffName}}', { customerName: 'Sam' })).toEqual(['staffName']);
  });
  it('formats appointment dates, and rejects junk', () => {
    expect(formatAppointmentDate('2026-10-14')).toBe('14 October 2026');
    expect(formatAppointmentDate('2026-10-14T12:00:00Z')).toBe('14 October 2026');
    expect(formatAppointmentDate('nope')).toBeNull();
    expect(formatAppointmentDate(null)).toBeNull();
  });
  it('previews with sample values', () => {
    expect(renderTemplateText(DEFAULT_BODY, SAMPLE_VALUES)).toContain('Hi Sam');
  });
});

describe('personalised review email', () => {
  const base = { customerName: 'Sam Taylor', businessName: 'Acme', reviewLink: 'https://acme.example/r/1', privateFeedbackUrl: 'https://app.example/feedback/1', unsubscribeUrl: 'https://app.example/u/1', appUrl: '' };
  it('uses custom subject and body for the first request, with real values', () => {
    const e = renderReviewRequestEmail({ ...base, customSubject: 'Thanks {{customerName}} for choosing {{businessName}}', customBody: '{{staffName}} fixed your {{serviceName}} on {{appointmentDate}}.', serviceName: 'Boiler Repair', staffName: 'Alex', appointmentDate: '14 October 2026' });
    expect(e.subject).toBe('Thanks Sam for choosing Acme');
    expect(e.html).toContain('Alex fixed your Boiler Repair on 14 October 2026.');
    expect(e.text).toContain('Alex fixed your Boiler Repair on 14 October 2026.');
  });
  it('falls back to friendly defaults when details are missing', () => {
    const e = renderReviewRequestEmail({ ...base, customBody: '{{staffName}} did your {{serviceName}}.' });
    expect(e.html).toContain('our team did your recent service.');
  });
  it('keeps the standard wording when no custom text is set', () => {
    const e = renderReviewRequestEmail(base);
    expect(e.subject).toBe('How was your visit to Acme?');
  });
  it('ignores custom copy for reminders', () => {
    const e = renderReviewRequestEmail({ ...base, variant: 'reminder', customSubject: 'CUSTOM', customBody: 'CUSTOM BODY' });
    expect(e.subject).not.toContain('CUSTOM');
    expect(e.html).not.toContain('CUSTOM BODY');
  });
  it('escapes owner-written markup and always keeps review, private feedback and unsubscribe links', () => {
    const e = renderReviewRequestEmail({ ...base, customBody: '<script>alert(1)</script> {{customerName}}' });
    expect(e.html).not.toContain('<script>alert(1)</script>');
    expect(e.html).toContain('&lt;script&gt;');
    expect(e.html).toContain('https://acme.example/r/1');
    expect(e.html).toContain('https://app.example/feedback/1');
    expect(e.html).toContain('https://app.example/u/1');
  });
});
