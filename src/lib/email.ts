import { Resend } from 'resend';
import { renderReviewRequestEmail } from '@/lib/email-templates/review-request';
import { APP_NAME, senderDisplayName, getAppUrl } from '@/lib/brand';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY environment variable.');
  }
  return new Resend(apiKey);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the legacy-flow review request email. `trackingUrl` points at our own
 * /r/{tracking_token} endpoint, which records the click and then
 * redirects to the business's real Google review URL. `unsubscribeUrl`
 * points at /api/unsubscribe/[customerId] so every send includes a working
 * opt-out link, as required by CAN-SPAM. The layout is shared with the
 * generalized messages flow (lib/email-templates/review-request.ts).
 */
export function buildReviewRequestEmail(params: {
  businessName: string;
  customerName: string;
  trackingUrl: string;
  unsubscribeUrl: string;
}) {
  const { businessName, customerName, trackingUrl, unsubscribeUrl } = params;
  const { subject, html, text } = renderReviewRequestEmail({
    variant: 'request',
    businessName,
    customerName,
    reviewLink: trackingUrl,
    unsubscribeUrl,
  });
  return { subject, html, text };
}

export async function sendReviewRequestEmail(params: {
  to: string;
  businessName: string;
  customerName: string;
  trackingUrl: string;
  unsubscribeUrl: string;
}) {
  const resend = getResendClient();
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const { subject, html, text } = buildReviewRequestEmail(params);

  const { error } = await resend.emails.send({
    from: `${senderDisplayName(params.businessName)} <${from}>`,
    to: params.to,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${params.unsubscribeUrl}>`,
    },
  });

  if (error) {
    throw new Error(typeof error === 'string' ? error : error.message);
  }
}

// ---------------------------------------------------------------------------
// Account notification emails (welcome / campaign sent / trial ending).
// Plain HTML, sent through Resend. With no RESEND_API_KEY (local dev) the
// email is logged instead of sent, so nothing breaks.
// ---------------------------------------------------------------------------

export type NotificationKind = 'welcome' | 'campaign' | 'trial_ending';

function layout(body: string) {
  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
<p style="font-size:18px;font-weight:700;color:#188038;margin:0 0 24px">${APP_NAME}</p>${body}
<p style="font-size:13px;color:#64748b;margin-top:32px">Questions? Just reply to this email.</p></div>`;
}

export function buildNotificationEmail(kind: NotificationKind, businessName: string) {
  const app = getAppUrl();
  const name = escapeHtml(businessName);
  const button = (href: string, label: string) =>
    `<p style="margin:24px 0"><a href="${href}" style="background:#188038;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">${label}</a></p>`;

  switch (kind) {
    case 'welcome':
      return {
        subject: `Welcome to ${APP_NAME}`,
        html: layout(`<p>Welcome, ${name}!</p><p>Add your Google review link and your first customer and we'll send your first review request.</p>${button(`${app}/dashboard`, 'Get started')}`),
      };
    case 'campaign':
      return {
        subject: 'Your campaign has been sent',
        html: layout(`<p>Good news: your first review request from ${name} has been sent.</p><p>Track clicks and feedback on your dashboard.</p>${button(`${app}/dashboard`, 'View dashboard')}`),
      };
    case 'trial_ending':
      return {
        subject: `Your ${APP_NAME} trial ends soon`,
        html: layout(`<p>Your free trial for ${name} ends in a few days.</p><p>Subscribe to keep sending review requests.</p>${button(`${app}/settings/billing`, 'Subscribe')}`),
      };
  }
}

export async function sendNotificationEmail(to: string, kind: NotificationKind, businessName: string) {
  const { subject, html } = buildNotificationEmail(kind, businessName);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email stub] to=${to} subject="${subject}"`);
    return;
  }
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const { error } = await getResendClient().emails.send({ from: `${APP_NAME} <${from}>`, to, subject, html });
  if (error) throw new Error(typeof error === 'string' ? error : error.message);
}

/**
 * Emails the business owner about a Google review alert (1-star review, rating
 * below threshold, month-over-month drop). Logged instead of sent when
 * RESEND_API_KEY is unset, like the other account notifications.
 */
export async function sendReviewAlertEmail(to: string, businessName: string, alert: { title: string; message: string }) {
  const app = getAppUrl();
  const subject = `${alert.title} \u2014 ${businessName}`;
  const html = layout(
    `<p style="font-weight:600">${escapeHtml(alert.title)}</p><p>${escapeHtml(alert.message)}</p>` +
      `<p style="margin:24px 0"><a href="${app}/reviews" style="background:#188038;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">View Reviews Analytics</a></p>`
  );
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email stub] to=${to} subject="${subject}"`);
    return;
  }
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const { error } = await getResendClient().emails.send({ from: `${APP_NAME} <${from}>`, to, subject, html });
  if (error) throw new Error(typeof error === 'string' ? error : error.message);
}

export async function sendReferralEmail(params: { to: string; customerName: string; businessName: string; code: string; customerReward: string; referrerReward: string; qrUrl: string }) {
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const safe = (v: string) => escapeHtml(v);
  const subject = 'Refer a Friend and Get Rewarded';
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
<p style="font-size:22px;font-weight:700;color:#188038;margin:0 0 8px;padding-bottom:12px;border-bottom:2px solid #188038">${safe(params.businessName)}</p>
<p style="font-size:18px;font-weight:600;margin:20px 0 4px">Refer A Friend</p><p>Hi ${safe(params.customerName)},</p><p>Share this referral code:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#188038">${safe(params.code)}</p><p>Your friend gets:<br><strong>${safe(params.customerReward)}</strong></p><p>You will receive:<br><strong>${safe(params.referrerReward)}</strong></p><p><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(params.qrUrl)}" alt="Referral QR code" width="180" height="180" /></p></div>`;
  const text = `${params.businessName}\n\nRefer A Friend\n\nShare this referral code: ${params.code}\nYour friend gets: ${params.customerReward}\nYou will receive: ${params.referrerReward}`;
  if (!process.env.RESEND_API_KEY) { console.log(`[email stub] to=${params.to} subject="${subject}"`); return; }
  const { error } = await getResendClient().emails.send({ from: `${senderDisplayName(params.businessName)} <${from}>`, to: params.to, subject, html, text });
  if (error) throw new Error(typeof error === 'string' ? error : error.message);
}

export async function sendReferralRedeemedEmail(params: { to: string; businessName: string; code: string; points: number }) {
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const subject = 'Your referral was successful';
  const html = layout(`<p>Great news!</p><p>Your referral code <strong>${escapeHtml(params.code)}</strong> has been redeemed.</p><p>You have received:</p><p><strong>${params.points} Loyalty Points</strong></p><p>Thank you for helping grow the business.</p>`);
  if (!process.env.RESEND_API_KEY) { console.log(`[email stub] to=${params.to} subject="${subject}"`); return; }
  const { error } = await getResendClient().emails.send({ from: `${senderDisplayName(params.businessName)} <${from}>`, to: params.to, subject, html });
  if (error) throw new Error(typeof error === 'string' ? error : error.message);
}
