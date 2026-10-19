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

export type ReviewEmailVariant = 'request' | 'reminder' | 'rebooking';

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
  /** Booking destination for the rebooking variant. */
  rebookingLink?: string | null;
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
  canvas: '#070b14',
  surface: '#0f1726',
  surface2: '#131f31',
  line: '#263952',
  ink: '#f5f8fc',
  ink2: '#c1cede',
  ink3: '#91a1b8',
  brand50: '#ecfdf5',
  brand200: '#a7f3d0',
  brand300: '#6ee7b7',
  brand700: '#22c98a',
  brand800: '#0e9f72',
  brand900: '#101c31',
  blue400: '#60a5fa',
  star: '#7dd3fc',
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
    heading: 'Thank you for choosing {{businessName}}',
    lead: "Hi {{customerName}}, we'd love to hear about your experience.",
    preheader: 'It only takes a minute to tell {{businessName}} how it went.',
    textIntro: "Thank you for choosing {{businessName}}. We'd love to hear about your experience.",
  },
  reminder: {
    heading: "We'd still love to hear from you",
    lead: "Hi {{customerName}}, we'd still love to hear how your visit went.",
    preheader: 'Your feedback means a lot to {{businessName}}.',
    textIntro: "We'd still love to hear how your visit to {{businessName}} went.",
  },
  rebooking: {
    heading: 'Ready for your next visit?',
    lead: "Hi {{customerName}}, whenever you're ready, we'd love to see you again at {{businessName}}.",
    preheader: 'Whenever you are ready, book your next visit with {{businessName}}.',
    textIntro: "Whenever you're ready, we'd love to see you again at {{businessName}}.",
  },
  cta: 'Leave a Review',
  ctaFallback: 'Share Your Feedback',
  rebookingCta: 'Book Your Next Appointment',
  ctaNote: 'Takes less than a minute',
  whyLabel: 'A note from the team',
  why: 'Your feedback helps local businesses improve and helps other customers make informed decisions.',
  rebookingWhy: "There is no rush — book whenever it suits you, and we look forward to welcoming you back.",
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
  if (variant === 'rebooking') {
    return businessName ? `Ready for your next visit to ${businessName}?` : 'Ready for your next visit?';
  }
  if (variant === 'reminder') {
    return businessName
      ? `We'd still love to hear from you — ${businessName}`
      : "We'd still love to hear from you";
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
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:58px;v-text-anchor:middle;width:300px;" arcsize="22%" strokecolor="${C.brand300}" fillcolor="${C.brand700}">
<w:anchorlock/>
<center style="color:#06131a;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">${safeLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:320px;margin:0 auto;border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${C.brand700}" style="border-radius:14px;background-color:${C.brand700};background-image:linear-gradient(135deg,${C.brand700} 0%,${C.brand800} 100%);border:1px solid ${C.brand300};box-shadow:0 0 0 1px rgba(52,211,153,0.12),0 12px 28px -12px rgba(34,201,138,0.85);">
      <a href="${safeHref}" target="_blank" class="rf-btn" style="display:block;padding:18px 24px;font-family:${FONT};font-size:18px;line-height:22px;font-weight:700;letter-spacing:-0.01em;color:#06131a;text-decoration:none;border-radius:14px;">${safeLabel}</a>
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
  const rebookingHref = isSafeHttpUrl(params.rebookingLink) ? params.rebookingLink.trim() : '';
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

  // Keep one clear action: review/feedback for review emails, booking for rebooking.
  const primary = variant === 'rebooking'
    ? rebookingHref
      ? { href: rebookingHref, label: REVIEW_EMAIL_COPY.rebookingCta }
      : null
    : reviewHref
      ? { href: reviewHref, label: REVIEW_EMAIL_COPY.cta }
      : feedbackHref
        ? { href: feedbackHref, label: REVIEW_EMAIL_COPY.ctaFallback }
        : null;
  const showSecondaryFeedback = variant !== 'rebooking' && Boolean(reviewHref && feedbackHref);
  const supportCopy = variant === 'rebooking' ? REVIEW_EMAIL_COPY.rebookingWhy : REVIEW_EMAIL_COPY.why;
  const supportLabel = variant === 'rebooking' ? '' : REVIEW_EMAIL_COPY.whyLabel;

  const platformLabel = params.reviewPlatform ? REVIEW_PLATFORMS[params.reviewPlatform]?.label : undefined;
  const ctaNote = variant === 'rebooking'
    ? 'Choose a time that suits you'
    : REVIEW_EMAIL_COPY.ctaNote + (platformLabel && reviewHref ? ` · Opens ${platformLabel}` : '');

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
      ? ` <a href="${escapeHtml(unsubscribeHref)}" class="rf-link" style="color:${C.brand700};text-decoration:underline;">Unsubscribe</a> from future emails.`
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
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="rf-card" bgcolor="${C.surface}" style="max-width:600px;margin:0 auto;background-color:${C.surface};border:1px solid ${C.line};border-radius:20px;border-collapse:separate;box-shadow:0 0 0 1px rgba(96,165,250,0.06),0 28px 70px -30px rgba(0,0,0,0.9);">

        <!-- Header -->
        <tr>
          <td class="rf-px" bgcolor="${C.brand900}" style="padding:20px 24px;background-color:${C.brand900};background-image:linear-gradient(135deg,#101c31 0%,#12344b 58%,#075b50 100%);border-bottom:1px solid rgba(110,231,183,0.24);border-radius:19px 19px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="40" valign="middle" style="width:40px;">${logoMarkHtml(logoSrc, 36)}</td>
                <td valign="middle" style="padding-left:10px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:600;letter-spacing:-0.02em;color:#ffffff;">${APP_NAME_LEAD}<span style="color:#ffffff;">${APP_NAME_ACCENT}</span></td>
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
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="rf-panel" bgcolor="${C.surface2}" style="background-color:${C.surface2};border:1px solid ${C.line};border-radius:14px;border-collapse:separate;box-shadow:inset 0 1px 0 rgba(255,255,255,0.035),0 10px 26px -20px rgba(0,0,0,0.9);">
              <tr>
                <td style="padding:18px 20px;font-family:${FONT};">
                  ${supportLabel ? `<p class="rf-eyebrow" style="margin:0 0 6px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.brand700};">${escapeHtml(supportLabel)}</p>` : ''}
                  <p class="rf-ink2" style="margin:0;font-size:15px;line-height:24px;color:${C.ink2};">${escapeHtml(supportCopy)}</p>
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
  const textRebooking = clean(params.rebookingLink);
  const textUnsubscribe = clean(params.unsubscribeUrl);
  const textAction = variant === 'rebooking'
    ? textRebooking
      ? `${REVIEW_EMAIL_COPY.rebookingCta}: ${textRebooking}`
      : ''
    : textReview
      ? `${REVIEW_EMAIL_COPY.cta}: ${textReview}`
      : textFeedback
        ? `${REVIEW_EMAIL_COPY.ctaFallback}: ${textFeedback}`
        : '';
  const textLines = [
    `Hi ${vars.customerName},`,
    '',
    t(copy.textIntro),
    '',
    textAction,
    '',
    supportCopy,
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
