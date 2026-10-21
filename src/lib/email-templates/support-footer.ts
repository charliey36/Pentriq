/**
 * The single reusable "Need help?" footer for customer-facing emails. It shows the BUSINESS's own
 * contact email and nothing else: with no (or an invalid) address it renders nothing at all, so
 * there is no empty gap and no Pentriq support address leaks into customer emails.
 * Every customer-facing template should call this rather than hand-rolling a support line.
 */
const EMAIL_RE = /^[^\s@<>"',;()]+@[^\s@<>"',;()]+\.[^\s@<>"',;()]+$/;

export function normalizeContactEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  return value.length > 0 && value.length <= 254 && EMAIL_RE.test(value) ? value : null;
}

function esc(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type SupportFooterStyle = {
  /** Colours (defaults suit the plain light templates). */
  label?: string;
  strong?: string;
  link?: string;
  /** Optional CSS class names (used by the review template's dark-mode overrides). */
  labelClass?: string;
  strongClass?: string;
  linkClass?: string;
};

export function renderSupportFooter(
  contactEmail: string | null | undefined,
  style: SupportFooterStyle = {}
): { html: string; text: string } {
  const email = normalizeContactEmail(contactEmail);
  if (!email) return { html: '', text: '' };
  const { label = '#64748b', strong = '#0f172a', link = '#188038' } = style;
  const cls = (c?: string) => (c ? ` class="${c}"` : '');
  const html = `<p${cls(style.labelClass)} style="margin:16px 0 0;font-size:13px;line-height:20px;color:${label};"><strong${cls(style.strongClass)} style="color:${strong};">Need help?</strong><br><a${cls(style.linkClass)} href="mailto:${esc(email)}" style="color:${link};text-decoration:underline;">${esc(email)}</a></p>`;
  return { html, text: `Need help? ${email}` };
}
