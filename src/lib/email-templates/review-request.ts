/**
 * Pentriq review-request email (initial request + reminder).
 *
 * Pure function: params in, { subject, html, text, preheader } out. No React,
 * no I/O — so the exact same output is used by the real send pipeline
 * (lib/templates.ts, lib/email.ts) and by the in-app preview
 * (/settings/email/preview).
 *
 * Email-client notes:
 *  - Table-based layout with every style inlined; the <style> block is only a
 *    progressive enhancement (wider padding on larger screens, dark mode).
 *    Base styles are the mobile layout, so clients that strip <style>
 *    (some Gmail/Outlook configurations) still render a correct mobile-width
 *    email.
 *  - Outlook (Windows/Word renderer) gets a VML "bulletproof" rounded button.
 *  - No SVG / web fonts (stripped by Gmail/Outlook). The logo mark is a PNG
 *    served from /email-assets/logo-mark.png; the wordmark is live text so the
 *    header still reads correctly when images are blocked.
 *  - Palette mirrors the app's design tokens (globals.css / tailwind brand
 *    scale). Text/background pairs are WCAG AA (>= 4.5:1), button text is
 *    white on brand-700 (5.5:1).
 *
 * Variables: copy below uses {{customerName}}, {{businessName}} and
 * {{reviewLink}}. Missing values fall back gracefully (see FALLBACKS).
 *
 * COMPLIANCE: when a private feedback URL is supplied it is always rendered,
 * independent of anything about the customer — see lib/compliance.ts.
 */
import { escapeHtml } from '@/lib/html';
import { APP_NAME, APP_NAME_ACCENT, APP_NAME_LEAD, getAppUrl } from '@/lib/brand';
import {
  REVIEW_PLATFORMS,
  isSafeHttpUrl,
  type ReviewPlatformId,
} from './review-destinations';

export type ReviewEmailVariant = 'request' | 'reminder';

export type ReviewEmailParams = {
  variant?: ReviewEmailVariant;
  customerName?: string | null;
  businessName?: string | null;
  /** href for the primary "Leave a Review" button. Omit to hide the button. */
  reviewLink?: string | null;
  /** Optional: names the destination under the button ("Opens Google Reviews"). */
  reviewPlatform?: ReviewPlatformId;
  /** Always-on private feedback channel (compliance). */
  privateFeedbackUrl?: string | null;
  unsubscribeUrl?: string | null;
  /** Optional business contact details shown in the footer. */
  businessContact?: { email?: string | null; phone?: string | null; website?: string | null };
  /** Base URL for hosted email assets. '' = relative (preview). Defaults to the app's public URL. */
  appUrl?: string;
};

export type RenderedReviewEmail = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

// ---------------------------------------------------------------------------
// Design tokens (hex equivalents of the app's CSS variables / brand scale)
// ---------------------------------------------------------------------------
const C = {
  canvas: '#eff3f9',
  surface: '#ffffff',
  surface2: '#f7f9fc',
  line: '#e1e7f0',
  ink: '#0b1220',
  ink2: '#2d384e',
  ink3: '#5e6a81',
  brand50: '#ecfdf5',
  brand200: '#a7f3d0',
  brand300: '#6ee7b7',
  brand700: '#047857',
  brand800: '#065f46',
  brand900: '#064e3b',
  star: '#f59e0b',
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// ---------------------------------------------------------------------------
// Copy + variables
// ---------------------------------------------------------------------------
export const FALLBACKS = {
  customerName: 'there',
  businessName: 'us',
} as const;

type CopyVars = { customerName: string; businessName: string; reviewLink: string };

/** Copy is expressed with {{variables}} so it can later be made editable per business. */
export const REVIEW_EMAIL_COPY = {
  request: {
    badge: 'Review request',
    heading: 'Thank you for choosing {{businessName}}',
    lead: "Hi {{customerName}}, we'd love to hear about your experience.",
    preheader: 'It only takes a minute to tell {{businessName}} how it went.',
    textIntro: "Thank you for choosing {{businessName}}. We'd love to hear about your experience.",
  },
  reminder: {
    badge: 'Friendly reminder',
    heading: 'A quick reminder from {{businessName}}',
    lead: "Hi {{customerName}}, we'd still love to hear how your visit went.",
    preheader: 'One minute is all it takes — your feedback means a lot to {{businessName}}.',
    textIntro: "A quick reminder from {{businessName}}: we'd still love to hear how your visit went.",
  },
  cta: 'Leave a Review',
  ctaFallback: 'Share Your Feedback',
  ctaNote: 'Takes less than a minute',
  whyLabel: 'Why it matters',
  why: 'Your feedback helps local businesses improve and helps other customers make informed decisions.',
  privatePrompt: 'Prefer to share your thoughts privately?',
  privateLink: 'Send private feedback',
} as const;

/** Replaces {{token}} placeholders. Unknown tokens render as ''. */
export function fillTemplate(
  template: string,
  vars: Record<string, string>,
  escape: (value: string) => string = (v) => v
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? escape(vars[key]) : ''
  );
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function firstName(value: string | null | undefined): string {
  return clean(value).split(' ')[0] ?? '';
}

function subjectFor(variant: ReviewEmailVariant, businessName: string): string {
  if (variant === 'reminder') {
    return businessName
      ? `Quick reminder — how was your visit to ${businessName}?`
      : 'Quick reminder — how was your recent visit?';
  }
  return businessName ? `How was your visit to ${businessName}?` : 'How was your recent visit?';
}

// ---------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------
function buttonHtml(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  // Mobile-first: a full-width table capped at 320px. The inner <a> is
  // display:block so the whole button is tappable (>= 56px tall).
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:58px;v-text-anchor:middle;width:300px;" arcsize="22%" strokecolor="${C.brand800}" fillcolor="${C.brand700}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">${safeLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:320px;margin:0 auto;border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${C.brand700}" style="border-radius:14px;background-color:${C.brand700};border:1px solid ${C.brand800};box-shadow:inset 0 1px 0 rgba(255,255,255,0.28),0 1px 2px rgba(4,120,87,0.4),0 12px 22px -10px rgba(16,185,129,0.75);">
      <a href="${safeHref}" target="_blank" class="rf-btn" style="display:block;padding:18px 24px;font-family:${FONT};font-size:18px;line-height:22px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;text-decoration:none;border-radius:14px;">${safeLabel}</a>
    </td>
  </tr>
</table>
<!--<![endif]-->`;
}

function logoMarkHtml(src: string, size: number): string {
  // Rendered at 3x for crisp retina output (asset is 120px).
  return `<img src="${escapeHtml(src)}" width="${size}" height="${size}" alt="" style="display:block;border:0;outline:none;text-decoration:none;border-radius:${Math.round(size * 0.28)}px;">`;
}

function contactLine(contact: ReviewEmailParams['businessContact']): string {
  if (!contact) return '';
  const parts: string[] = [];
  const email = clean(contact.email);
  const phone = clean(contact.phone);
  const website = clean(contact.website);
  if (email && /^[^\s@<>"]+@[^\s@<>"]+$/.test(email)) {
    parts.push(`<a href="mailto:${escapeHtml(email)}" class="rf-link" style="color:${C.brand700};text-decoration:underline;">${escapeHtml(email)}</a>`);
  }
  if (phone) {
    const tel = phone.replace(/[^\d+]/g, '');
    parts.push(
      tel
        ? `<a href="tel:${escapeHtml(tel)}" class="rf-link" style="color:${C.brand700};text-decoration:underline;">${escapeHtml(phone)}</a>`
        : escapeHtml(phone)
    );
  }
  if (isSafeHttpUrl(website)) {
    parts.push(
      `<a href="${escapeHtml(website)}" class="rf-link" style="color:${C.brand700};text-decoration:underline;">${escapeHtml(website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`
    );
  }
  return parts.join('&nbsp;&nbsp;·&nbsp;&nbsp;');
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------
export function renderReviewRequestEmail(params: ReviewEmailParams = {}): RenderedReviewEmail {
  const variant: ReviewEmailVariant = params.variant ?? 'request';
  const copy = REVIEW_EMAIL_COPY[variant];

  const rawBusiness = clean(params.businessName);
  const rawCustomer = firstName(params.customerName);
  const hasBusiness = rawBusiness.length > 0;

  const reviewHref = isSafeHttpUrl(params.reviewLink) ? params.reviewLink.trim() : '';
  const feedbackHref = isSafeHttpUrl(params.privateFeedbackUrl) ? params.privateFeedbackUrl.trim() : '';
  const unsubscribeHref = isSafeHttpUrl(params.unsubscribeUrl) ? params.unsubscribeUrl.trim() : '';

  const vars: CopyVars = {
    customerName: rawCustomer || FALLBACKS.customerName,
    businessName: rawBusiness || FALLBACKS.businessName,
    reviewLink: reviewHref,
  };
  const h = (template: string) => fillTemplate(template, vars, escapeHtml);
  const t = (template: string) => fillTemplate(template, vars);

  const subject = subjectFor(variant, rawBusiness);
  const preheader = t(copy.preheader);

  // Primary CTA: the review link; if there isn't one, promote private
  // feedback so the email still has exactly one clear action.
  const primary = reviewHref
    ? { href: reviewHref, label: REVIEW_EMAIL_COPY.cta }
    : feedbackHref
      ? { href: feedbackHref, label: REVIEW_EMAIL_COPY.ctaFallback }
      : null;
  const showSecondaryFeedback = Boolean(reviewHref && feedbackHref);

  const platformLabel = params.reviewPlatform ? REVIEW_PLATFORMS[params.reviewPlatform]?.label : undefined;
  const ctaNote =
    REVIEW_EMAIL_COPY.ctaNote + (platformLabel && reviewHref ? ` · Opens ${platformLabel}` : '');

  const base = (params.appUrl ?? getAppUrl()).replace(/\/+$/, '');
  const logoSrc = `${base}/email-assets/logo-mark.png`;

  const contact = contactLine(params.businessContact);

  const footerBusiness = hasBusiness
    ? `<p class="rf-muted" style="margin:0 0 4px;font-size:13px;line-height:20px;color:${C.ink3};">Sent on behalf of <strong class="rf-ink2" style="color:${C.ink2};font-weight:600;">${escapeHtml(rawBusiness)}</strong></p>`
    : '';
  const footerContact = contact
    ? `<p class="rf-muted" style="margin:0 0 4px;font-size:13px;line-height:20px;color:${C.ink3};">${contact}</p>`
    : '';
  const footerReason = `<p class="rf-muted" style="margin:12px 0 0;font-size:12px;line-height:18px;color:${C.ink3};">You received this email because you are a customer of ${
    hasBusiness ? escapeHtml(rawBusiness) : `a business that uses ${APP_NAME}`
  }${/[.!?]$/.test(rawBusiness) && hasBusiness ? '' : '.'}${
    unsubscribeHref
      ? ` <a href="${escapeHtml(unsubscribeHref)}" class="rf-link" style="color:${C.brand700};text-decoration:underline;">Unsubscribe</a> from future review emails.`
      : ''
  }</p>`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,a{font-family:Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark;}
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;}
  a{text-decoration:none;}
  @media only screen and (min-width:520px){
    .rf-outer{padding:40px 24px 48px !important;}
    .rf-px{padding-left:44px !important;padding-right:44px !important;}
    .rf-h1{font-size:32px !important;line-height:38px !important;}
  }
  @media (prefers-color-scheme:dark){
    .rf-canvas{background-color:#06090e !important;}
    .rf-card{background-color:#10161f !important;border-color:#1e2735 !important;}
    .rf-panel{background-color:#161e2a !important;border-color:#1e2735 !important;}
    .rf-footer{background-color:#0c1119 !important;border-color:#1e2735 !important;}
    .rf-ink{color:#f0f4fa !important;}
    .rf-ink2{color:#c4cddc !important;}
    .rf-muted{color:#8f9baf !important;}
    .rf-link{color:#6ee7b7 !important;}
    .rf-eyebrow{color:#6ee7b7 !important;}
  }
</style>
</head>
<body class="rf-canvas" style="margin:0;padding:0;width:100%;background-color:${C.canvas};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}${'&nbsp;&zwnj;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="rf-canvas" bgcolor="${C.canvas}" style="background-color:${C.canvas};">
  <tr>
    <td align="center" class="rf-outer" style="padding:20px 12px 32px;">
      <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="rf-card" bgcolor="${C.surface}" style="max-width:600px;margin:0 auto;background-color:${C.surface};border:1px solid ${C.line};border-radius:20px;border-collapse:separate;box-shadow:0 1px 2px rgba(16,24,40,0.05),0 28px 56px -28px rgba(16,24,40,0.22);">

        <!-- Header -->
        <tr>
          <td class="rf-px" bgcolor="${C.brand900}" style="padding:20px 24px;background-color:${C.brand900};background-image:linear-gradient(135deg,${C.brand900} 0%,${C.brand700} 100%);border-radius:19px 19px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="40" valign="middle" style="width:40px;">${logoMarkHtml(logoSrc, 36)}</td>
                <td valign="middle" style="padding-left:10px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:600;letter-spacing:-0.02em;color:#ffffff;">${APP_NAME_LEAD}<span style="color:#ffffff;">${APP_NAME_ACCENT}</span></td>
                <td align="right" valign="middle" style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.brand200};">${escapeHtml(copy.badge)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td class="rf-px" align="center" style="padding:40px 24px 8px;font-family:${FONT};">
            <div aria-hidden="true" style="font-size:22px;line-height:26px;letter-spacing:4px;color:${C.star};padding:0 0 18px;">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
            <h1 class="rf-h1 rf-ink" style="margin:0;font-family:${FONT};font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.03em;color:${C.ink};">${h(copy.heading)}</h1>
            <p class="rf-ink2" style="margin:14px 0 0;font-family:${FONT};font-size:17px;line-height:27px;color:${C.ink2};">${h(copy.lead)}</p>
          </td>
        </tr>
${
  primary
    ? `
        <!-- Primary CTA -->
        <tr>
          <td class="rf-px" align="center" style="padding:28px 24px 8px;font-family:${FONT};">
            ${buttonHtml(primary.href, primary.label)}
            <p class="rf-muted" style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.ink3};">${escapeHtml(ctaNote)}</p>
          </td>
        </tr>`
    : ''
}

        <!-- Supporting content -->
        <tr>
          <td class="rf-px" style="padding:28px 24px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="rf-panel" bgcolor="${C.surface2}" style="background-color:${C.surface2};border:1px solid ${C.line};border-radius:14px;border-collapse:separate;">
              <tr>
                <td style="padding:18px 20px;font-family:${FONT};">
                  <p class="rf-eyebrow" style="margin:0 0 6px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.brand700};">${escapeHtml(REVIEW_EMAIL_COPY.whyLabel)}</p>
                  <p class="rf-ink2" style="margin:0;font-size:15px;line-height:24px;color:${C.ink2};">${escapeHtml(REVIEW_EMAIL_COPY.why)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
${
  showSecondaryFeedback
    ? `
        <!-- Private feedback (always offered alongside the public review link) -->
        <tr>
          <td class="rf-px" align="center" style="padding:16px 24px 0;font-family:${FONT};">
            <p class="rf-muted" style="margin:0;font-size:14px;line-height:22px;color:${C.ink3};">${escapeHtml(REVIEW_EMAIL_COPY.privatePrompt)} <a href="${escapeHtml(feedbackHref)}" class="rf-link" style="color:${C.brand700};font-weight:600;text-decoration:underline;">${escapeHtml(REVIEW_EMAIL_COPY.privateLink)}</a></p>
          </td>
        </tr>`
    : ''
}

        <!-- Spacer -->
        <tr><td style="font-size:0;line-height:0;height:32px;">&nbsp;</td></tr>

        <!-- Trust footer -->
        <tr>
          <td class="rf-px rf-footer" bgcolor="${C.surface2}" style="padding:22px 24px 24px;background-color:${C.surface2};border-top:1px solid ${C.line};border-radius:0 0 19px 19px;font-family:${FONT};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
              <tr>
                <td width="22" valign="middle" style="width:22px;">${logoMarkHtml(logoSrc, 20)}</td>
                <td valign="middle" class="rf-ink" style="padding-left:8px;font-size:13px;line-height:20px;font-weight:600;letter-spacing:-0.01em;color:${C.ink};">Sent via ${APP_NAME}</td>
              </tr>
            </table>
            ${footerBusiness}
            ${footerContact}
            ${footerReason}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;

  // Plain-text alternative. Links are used as given (no HTML-href safety
  // concern here), which also keeps `{{placeholder}}` links intact for the
  // AI-draft hook in lib/ai.ts.
  const textReview = clean(params.reviewLink);
  const textFeedback = clean(params.privateFeedbackUrl);
  const textUnsubscribe = clean(params.unsubscribeUrl);
  const textLines = [
    `Hi ${vars.customerName},`,
    '',
    t(copy.textIntro),
    '',
    textReview
      ? `${REVIEW_EMAIL_COPY.cta}: ${textReview}`
      : textFeedback
        ? `${REVIEW_EMAIL_COPY.ctaFallback}: ${textFeedback}`
        : '',
    '',
    REVIEW_EMAIL_COPY.why,
    '',
    textReview && textFeedback
      ? `${REVIEW_EMAIL_COPY.privatePrompt} ${REVIEW_EMAIL_COPY.privateLink}: ${textFeedback}`
      : '',
    '',
    '--',
    `Sent via ${APP_NAME}${hasBusiness ? ` on behalf of ${rawBusiness}` : ''}`,
    [clean(params.businessContact?.email), clean(params.businessContact?.phone), clean(params.businessContact?.website)]
      .filter(Boolean)
      .join(' · '),
    textUnsubscribe ? `Unsubscribe: ${textUnsubscribe}` : '',
  ];
  // Collapse runs of blank lines left by omitted sections.
  const text = textLines
    .filter((line, i) => !(line === '' && (textLines[i - 1] === '' || i === 0)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { subject, preheader, html, text };
}
