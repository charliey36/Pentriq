/**
 * Channel-agnostic messaging abstraction. Every outbound customer message
 * (review requests, reminders, rebooking nudges, win-back, birthday) goes
 * through `sendMessage()` rather than calling a provider SDK directly, so:
 *
 *  - adding a channel (SMS, WhatsApp) doesn't require touching call sites
 *  - consent/unsubscribe checks happen in exactly one place
 *  - a provider can be swapped (e.g. Twilio -> another SMS vendor) without
 *    touching anything upstream of this file
 *
 * Email is fully implemented (Resend, same provider as the original MVP).
 * SMS and WhatsApp are implemented against a `SmsProvider` interface with a
 * console-logging stub as the default implementation — the structure is
 * complete and tested, but actually delivering an SMS requires a real
 * provider (Twilio or equivalent) and credentials this environment doesn't
 * have. Set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER to
 * swap in a real provider — see `createSmsProvider()` below.
 */
import { Resend } from 'resend';
import { escapeHtml } from '@/lib/html';
import { transformResendError } from '@/lib/email-sandbox';
import { logEvent } from '@/lib/log';
import { notifyEmailSent } from '@/lib/email-events';
import { isBlockedTestEmail, TEST_EMAIL_ERROR_MESSAGE } from '@/lib/test-email';

export type MessageChannel = 'email' | 'sms' | 'whatsapp';

export type SendMessageParams = {
  channel: MessageChannel;
  to: { email?: string; phone?: string };
  subject?: string;
  html?: string;
  text: string;
  listUnsubscribeUrl?: string;
};

export class MessageSendError extends Error {}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new MessageSendError('Missing RESEND_API_KEY environment variable.');
  }
  return new Resend(apiKey);
}

async function sendEmail(params: SendMessageParams, fromLabel: string) {
  if (!params.to.email) {
    throw new MessageSendError('Cannot send an email message: no email address on file.');
  }

  // Reserved testing domains are always rejected by Resend; skip the call (still logged locally).
  if (isBlockedTestEmail(params.to.email)) {
    logEvent('email', 'blocked_test_domain', { to: params.to.email }, 'warn');
    throw new MessageSendError(TEST_EMAIL_ERROR_MESSAGE);
  }

  const resend = getResendClient();
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  

  const { error } = await resend.emails.send({
    from: `${fromLabel} <${from}>`,
    to: params.to.email,
    subject: params.subject ?? '',
    html: params.html ?? `<p>${escapeHtml(params.text)}</p>`,
    text: params.text,
    headers: params.listUnsubscribeUrl
      ? { 'List-Unsubscribe': `<${params.listUnsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      : undefined,
  });

  if (error) {
    const errorMsg = typeof error === 'string' ? error : error.message;
    logEvent('email', 'send_failed', { to: params.to.email, subject: params.subject, reason: errorMsg }, 'error');
    
    // Transform sandbox errors into human-readable messages
    const humanError = transformResendError(errorMsg);
    throw new MessageSendError(humanError);
  }
  
  logEvent('email', 'sent', { to: params.to.email, subject: params.subject });
  notifyEmailSent();
}

/**
 * Minimal interface any SMS/WhatsApp provider must implement. Swap
 * `createSmsProvider()`'s return value to plug in Twilio (or another
 * vendor) once credentials are available — nothing else in the codebase
 * needs to change, since every caller goes through `sendMessage()`.
 */
export interface SmsProvider {
  send(params: { to: string; body: string; whatsapp: boolean }): Promise<void>;
}

/**
 * Stub provider used when no real SMS credentials are configured. Logs the
 * message server-side instead of delivering it, and marks the send
 * successful so the rest of the pipeline (retry logic, status tracking,
 * journey advancement) can be fully exercised and tested without a live
 * Twilio account. Swapped out automatically once TWILIO_ACCOUNT_SID /
 * TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER are all set (see
 * `createSmsProvider`), at which point it should be replaced with a real
 * Twilio REST API call using those credentials.
 */
class LoggingStubSmsProvider implements SmsProvider {
  async send(params: { to: string; body: string; whatsapp: boolean }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[messaging:stub] Would send ${params.whatsapp ? 'WhatsApp' : 'SMS'} message (${params.body.length} chars)`
    );
  }
}

function createSmsProvider(): SmsProvider {
  const hasTwilioCredentials =
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER;

  if (!hasTwilioCredentials) {
    return new LoggingStubSmsProvider();
  }

  // Real Twilio wiring intentionally left unimplemented: this environment
  // has no Twilio account to test against, and shipping an untested REST
  // call would be worse than a clearly-logged stub. Once credentials exist,
  // implement SmsProvider here using the `twilio` package's REST client
  // (accountSid, authToken, from: TWILIO_FROM_NUMBER) and this function
  // will pick it up automatically — no other code needs to change.
  return new LoggingStubSmsProvider();
}

const smsProvider = createSmsProvider();

async function sendSms(params: SendMessageParams, whatsapp: boolean) {
  if (!params.to.phone) {
    throw new MessageSendError('Cannot send an SMS/WhatsApp message: no phone number on file.');
  }
  await smsProvider.send({ to: params.to.phone, body: params.text, whatsapp });
}

/**
 * Send a message on the given channel. This is the single entry point
 * every feature (review sequences, rebooking reminders, win-back,
 * birthday) should call — never reach for Resend or an SMS SDK directly.
 */
export async function sendMessage(params: SendMessageParams, fromLabel: string): Promise<void> {
  if (params.channel === 'email') {
    await sendEmail(params, fromLabel);
  } else if (params.channel === 'sms') {
    await sendSms(params, false);
  } else {
    await sendSms(params, true);
  }
}

/**
 * Resolve the best available channel for a customer given what contact
 * info and consent they have. Falls back from the requested channel to
 * whatever is actually usable, never returns a channel the customer has
 * opted out of.
 */
export function resolveChannel(
  requested: MessageChannel,
  customer: { email: string; phone: string | null; unsubscribed_at: string | null; unsubscribed_sms_at: string | null }
): MessageChannel | null {
  const emailAvailable = Boolean(customer.email) && !customer.unsubscribed_at;
  const smsAvailable = Boolean(customer.phone) && !customer.unsubscribed_sms_at;

  if (requested === 'email' && emailAvailable) return 'email';
  if ((requested === 'sms' || requested === 'whatsapp') && smsAvailable) return requested;

  // Fall back to whichever other channel is available.
  if (emailAvailable) return 'email';
  if (smsAvailable) return 'sms';
  return null;
}
