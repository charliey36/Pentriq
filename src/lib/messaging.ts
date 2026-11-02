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
  /** The business's own contact email: customer replies go here instead of the platform's sending address. */
  replyTo?: string | null;
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
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
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
 * Twilio account. Replaced by `TwilioSmsProvider` automatically once
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER are all set.
 */
class LoggingStubSmsProvider implements SmsProvider {
  async send(params: { to: string; body: string; whatsapp: boolean }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[messaging:stub] Would send ${params.whatsapp ? 'WhatsApp' : 'SMS'} message (${params.body.length} chars)`
    );
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Twilio Programmable Messaging over its REST API (no SDK dependency).
 * WhatsApp uses Twilio's `whatsapp:` address prefix; TWILIO_FROM_NUMBER is the
 * sender for both (for WhatsApp it must be a WhatsApp-enabled sender).
 * Not yet exercised against a live Twilio account: verify with a test number first.
 */
export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike
  ) {}

  async send(params: { to: string; body: string; whatsapp: boolean }): Promise<void> {
    const prefix = params.whatsapp ? 'whatsapp:' : '';
    const form = new URLSearchParams({ To: `${prefix}${params.to}`, From: `${prefix}${this.from}`, Body: params.body });
    const res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(await res.text()) as { message?: string; code?: number };
        if (j.message) reason = `${j.message}${j.code ? ` (code ${j.code})` : ''}`;
      } catch { /* keep HTTP status */ }
      logEvent('sms', 'send_failed', { whatsapp: params.whatsapp, reason }, 'error');
      throw new MessageSendError(`SMS provider rejected the message: ${reason}`);
    }
    logEvent('sms', 'sent', { whatsapp: params.whatsapp, length: params.body.length });
  }
}

export function createSmsProvider(env: NodeJS.ProcessEnv = process.env, fetchImpl?: FetchLike): SmsProvider {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from } = env;
  if (!sid || !token || !from) return new LoggingStubSmsProvider();
  return new TwilioSmsProvider(sid, token, from, fetchImpl);
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
