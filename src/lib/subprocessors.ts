/**
 * Third parties that process personal data for Pentriq, as evidenced by the code (one place, used by the
 * /subprocessors page and the privacy policy). Keep in step with integrations: adding a provider here is part of
 * shipping it. Processing regions depend on how each account is configured and are confirmed on request.
 */
export type Subprocessor = {
  name: string;
  purpose: string;
  data: string;
  /** When the provider is involved at all. */
  when: 'always' | 'if-enabled' | 'if-connected';
  url: string;
};

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: 'Supabase',
    purpose: 'Database, sign-in and file storage (business logos)',
    data: 'Account details, business settings, customer records, messages and activity',
    when: 'always',
    url: 'https://supabase.com/privacy',
  },
  {
    name: 'Vercel',
    purpose: 'Application hosting and scheduled jobs',
    data: 'All data in transit through the application; request logs',
    when: 'always',
    url: 'https://vercel.com/legal/privacy-policy',
  },
  {
    name: 'Resend',
    purpose: 'Sending review requests, reminders and account emails',
    data: 'Recipient name and email address, message content',
    when: 'always',
    url: 'https://resend.com/legal/privacy-policy',
  },
  {
    name: 'Stripe',
    purpose: 'Subscription billing and payments',
    data: 'Account owner name, email and billing details (card details go to Stripe only)',
    when: 'always',
    url: 'https://stripe.com/privacy',
  },
  {
    name: 'Sentry',
    purpose: 'Error monitoring',
    data: 'Technical error details with internal user and business identifiers (no names or email addresses)',
    when: 'if-enabled',
    url: 'https://sentry.io/privacy/',
  },
  {
    name: 'Google',
    purpose: 'Google Business Profile sync and replies, optional Google sign-in, AI-drafted review replies (Gemini)',
    data: 'Public Google reviews and replies; sign-in email; review text for drafting (reviewer names are never sent)',
    when: 'if-connected',
    url: 'https://policies.google.com/privacy',
  },
  {
    name: 'Twilio',
    purpose: 'SMS and WhatsApp messages',
    data: 'Recipient phone number and message content',
    when: 'if-enabled',
    url: 'https://www.twilio.com/en-us/legal/privacy',
  },
  {
    name: 'Square, Acuity Scheduling, Calendly',
    purpose: 'Importing completed appointments from a connected booking system',
    data: 'Customer name, email, phone and appointment details from the business’s own booking account',
    when: 'if-connected',
    url: 'https://squareup.com/gb/en/legal/general/privacy',
  },
];

export const WHEN_LABEL: Record<Subprocessor['when'], string> = {
  always: 'Always',
  'if-enabled': 'When enabled for the service',
  'if-connected': 'Only if a business connects it',
};
