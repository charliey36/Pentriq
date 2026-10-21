/**
 * Pentriq welcome email (sent once when a business account is created).
 * Table-based layout with inline styles so it renders in Gmail/Outlook/Apple
 * Mail; a small <style> block adds mobile tweaks where supported.
 */
import { APP_NAME, APP_NAME_ACCENT, APP_NAME_LEAD, getAppUrl } from '@/lib/brand';

export const SUPPORT_EMAIL = 'hello@pentriq.cloud';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const BRAND = '#188038';

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STEPS = [
  { title: 'Import Customers', body: 'Add customers one by one or upload a CSV.', path: '/customers' },
  { title: 'Configure Loyalty Program', body: 'Set how customers earn and redeem points.', path: '/settings/loyalty' },
  { title: 'Create Referral Promotions', body: 'Reward customers who bring in new business.', path: '/settings/loyalty' },
  { title: 'Invite Customers', body: 'Send your first review request.', path: '/customers' },
] as const;

export function renderWelcomeEmail(params: { businessName?: string } = {}) {
  const app = getAppUrl();
  const dashboardUrl = `${app}/dashboard`;
  const business = params.businessName?.trim();
  const subject = `Welcome to ${APP_NAME}`;

  const stepRows = STEPS.map(
    (step) => `<tr>
<td width="32" valign="top" style="padding:10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="24" height="24" style="width:24px;height:24px;border-radius:12px;background-color:#e6f4ea;color:${BRAND};font-family:${FONT};font-size:14px;line-height:24px;font-weight:700;">&#10003;</td></tr></table></td>
<td valign="top" style="padding:10px 0;font-family:${FONT};font-size:15px;line-height:22px;color:#0f172a;"><a href="${app}${step.path}" style="color:#0f172a;text-decoration:none;font-weight:600;">${step.title}</a><br><span style="color:#64748b;font-size:14px;">${step.body}</span></td>
</tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title>
<style>@media only screen and (max-width:620px){.w-px{padding-left:22px !important;padding-right:22px !important;}.w-h1{font-size:24px !important;line-height:30px !important;}.w-btn{display:block !important;}}</style></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your account is ready. Four quick steps to start growing loyalty, referrals and reviews.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;">
<tr><td class="w-px" style="padding:28px 40px 0 40px;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">${APP_NAME_LEAD}<span style="color:${BRAND};">${APP_NAME_ACCENT}</span></td></tr>
<tr><td class="w-px" style="padding:28px 40px 8px 40px;">
<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND};">${business ? esc(business) : 'Your account is ready'}</p>
<h1 class="w-h1" style="margin:0 0 14px;font-family:${FONT};font-size:30px;line-height:36px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">Welcome to ${APP_NAME}</h1>
<p style="margin:0;font-family:${FONT};font-size:16px;line-height:26px;color:#475569;">Thank you for joining ${APP_NAME}.<br>You're now ready to start growing customer loyalty, generating referrals and collecting more reviews.</p>
</td></tr>
<tr><td class="w-px" style="padding:24px 40px 0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;"><tr><td style="padding:20px 22px;">
<p style="margin:0 0 6px;font-family:${FONT};font-size:16px;font-weight:700;color:#0f172a;">Getting started</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepRows}</table>
</td></tr></table></td></tr>
<tr><td class="w-px" align="center" style="padding:28px 40px 8px 40px;">
<a class="w-btn" href="${dashboardUrl}" style="display:inline-block;background-color:${BRAND};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;text-decoration:none;padding:14px 32px;border-radius:10px;">Open ${APP_NAME} Dashboard</a>
</td></tr>
<tr><td class="w-px" style="padding:28px 40px 32px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e2e8f0;"><tr><td style="padding-top:20px;font-family:${FONT};font-size:14px;line-height:22px;color:#64748b;text-align:center;">
<strong style="color:#0f172a;">Need help?</strong><br><a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};text-decoration:none;font-weight:600;">${SUPPORT_EMAIL}</a>
<p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">&copy; ${new Date().getFullYear()} ${APP_NAME}. You received this email because you created a ${APP_NAME} account.</p>
</td></tr></table></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Welcome to ${APP_NAME}`,
    '',
    `Thank you for joining ${APP_NAME}.`,
    "You're now ready to start growing customer loyalty, generating referrals and collecting more reviews.",
    '',
    'Getting started:',
    ...STEPS.map((s) => `  - ${s.title}`),
    '',
    `Open ${APP_NAME} Dashboard: ${dashboardUrl}`,
    '',
    `Need help? ${SUPPORT_EMAIL}`,
  ].join('\n');

  return { subject, html, text };
}
