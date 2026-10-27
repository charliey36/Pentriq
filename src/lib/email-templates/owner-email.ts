/**
 * Reusable layout for emails Pentriq sends TO a business owner (weekly summary,
 * milestones, ...). Table-based with inline styles, matching the welcome email.
 * Customer-facing emails use review-request.ts instead.
 *
 * Pure: params in, { html, text } out. All text is escaped here.
 */
import { APP_NAME, APP_NAME_ACCENT, APP_NAME_LEAD, getAppUrl } from '@/lib/brand';
import { escapeHtml as esc } from '@/lib/html';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const BRAND = '#188038';

export type OwnerEmailStat = { label: string; value: string; hint?: string };

export type OwnerEmailParams = {
  preheader: string;
  eyebrow?: string;
  heading: string;
  /** Paragraphs shown under the heading. */
  intro: string[];
  stats?: OwnerEmailStat[];
  /** Highlighted call-out box (e.g. the ROI line). */
  highlight?: string;
  cta?: { label: string; path: string };
  /** Small print above the footer, e.g. how to turn the email off. */
  footnote?: string;
};

export function renderOwnerEmail(p: OwnerEmailParams): { html: string; text: string } {
  const app = getAppUrl();
  const stats = p.stats ?? [];
  const statCells = stats
    .map(
      (s) => `<td width="${Math.floor(100 / Math.min(stats.length, 3))}%" valign="top" style="padding:6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;"><tr><td style="padding:14px 16px;">
<p style="margin:0;font-family:${FONT};font-size:12px;color:#64748b;">${esc(s.label)}</p>
<p style="margin:4px 0 0;font-family:${FONT};font-size:24px;line-height:28px;font-weight:700;color:#0f172a;">${esc(s.value)}</p>
${s.hint ? `<p style="margin:2px 0 0;font-family:${FONT};font-size:12px;color:${BRAND};">${esc(s.hint)}</p>` : ''}
</td></tr></table></td>`
    )
    .reduce<string[][]>((rows, cell, i) => {
      if (i % 3 === 0) rows.push([]);
      rows[rows.length - 1].push(cell);
      return rows;
    }, [])
    .map((cells) => `<tr>${cells.join('')}</tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(p.heading)}</title>
<style>@media only screen and (max-width:620px){.o-px{padding-left:20px !important;padding-right:20px !important;}.o-h1{font-size:24px !important;line-height:30px !important;}}</style></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;">
<tr><td class="o-px" style="padding:28px 36px 0 36px;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">${APP_NAME_LEAD}<span style="color:${BRAND};">${APP_NAME_ACCENT}</span></td></tr>
<tr><td class="o-px" style="padding:24px 36px 4px 36px;">
${p.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND};">${esc(p.eyebrow)}</p>` : ''}
<h1 class="o-h1" style="margin:0 0 12px;font-family:${FONT};font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">${esc(p.heading)}</h1>
${p.intro.map((t) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:16px;line-height:25px;color:#475569;">${esc(t)}</p>`).join('')}
</td></tr>
${stats.length ? `<tr><td class="o-px" style="padding:8px 30px 0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${statCells}</table></td></tr>` : ''}
${p.highlight ? `<tr><td class="o-px" style="padding:16px 36px 0 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e6f4ea;border-radius:12px;"><tr><td style="padding:16px 18px;font-family:${FONT};font-size:15px;line-height:23px;color:#14532d;">${esc(p.highlight)}</td></tr></table></td></tr>` : ''}
${p.cta ? `<tr><td class="o-px" align="center" style="padding:26px 36px 6px 36px;"><a href="${app}${esc(p.cta.path)}" style="display:inline-block;background-color:${BRAND};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;text-decoration:none;padding:14px 30px;border-radius:10px;">${esc(p.cta.label)}</a></td></tr>` : ''}
<tr><td class="o-px" style="padding:24px 36px 30px 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e2e8f0;"><tr><td style="padding-top:16px;font-family:${FONT};font-size:12px;line-height:19px;color:#94a3b8;text-align:center;">
${p.footnote ? `${esc(p.footnote)}<br>` : ''}Questions? Just reply to this email. &copy; ${new Date().getFullYear()} ${APP_NAME}
</td></tr></table></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    p.heading,
    '',
    ...p.intro.flatMap((t) => [t, '']),
    ...stats.map((s) => `${s.label}: ${s.value}${s.hint ? ` (${s.hint})` : ''}`),
    ...(stats.length ? [''] : []),
    ...(p.highlight ? [p.highlight, ''] : []),
    ...(p.cta ? [`${p.cta.label}: ${app}${p.cta.path}`, ''] : []),
    ...(p.footnote ? [p.footnote] : []),
  ].join('\n');

  return { html, text };
}
