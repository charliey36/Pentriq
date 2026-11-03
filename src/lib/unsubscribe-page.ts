/**
 * The public unsubscribe page, rendered as plain HTML from the route handler (no app shell: the visitor is a
 * business's customer, not a Pentriq user).
 *
 * Why a confirmation step: corporate email security gateways (Microsoft Defender Safe Links, Mimecast,
 * Proofpoint) and some mail apps fetch every link in an email to scan it. When a plain GET unsubscribed, those
 * scanners silently unsubscribed real customers who never clicked anything. Now GET only shows this page; the
 * unsubscribe itself is a POST, sent either by the button below or by the mail client's RFC 8058 one-click
 * request (List-Unsubscribe-Post), neither of which a link scanner performs.
 */
import { escapeHtml } from '@/lib/html';

export type UnsubscribeState = 'confirm' | 'done' | 'already' | 'invalid' | 'not_found' | 'rate_limited';

const COPY: Record<UnsubscribeState, { title: string; body: (business: string) => string }> = {
  confirm: {
    title: 'Unsubscribe from emails?',
    body: (b) => `You will stop receiving review requests and reminders from ${b}.`,
  },
  done: {
    title: "You've been unsubscribed",
    body: (b) => `You won't receive any further emails from ${b}. If this was a mistake, contact them directly.`,
  },
  already: {
    title: "You're already unsubscribed",
    body: (b) => `You don't receive emails from ${b}. There is nothing else to do.`,
  },
  invalid: { title: 'This link is not valid', body: () => 'Please use the unsubscribe link from the most recent email you received.' },
  not_found: { title: 'We could not find that subscription', body: () => 'It may already have been removed. You will not receive further emails from this link.' },
  rate_limited: { title: 'Please try again shortly', body: () => 'Too many requests came from your network. Wait a few minutes and try again.' },
};

export function renderUnsubscribePage(state: UnsubscribeState, opts: { businessName?: string | null; actionPath?: string } = {}): string {
  const business = escapeHtml(opts.businessName?.trim() || 'this business');
  const copy = COPY[state];
  const form =
    state === 'confirm' && opts.actionPath
      ? `<form method="post" action="${escapeHtml(opts.actionPath)}">
      <input type="hidden" name="confirm" value="1" />
      <button type="submit">Unsubscribe</button>
    </form>
    <p class="small">Changed your mind? Just close this page.</p>`
      : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(copy.title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #f4f6fa; color: #0b1220; }
    main { max-width: 440px; margin: 12vh auto; padding: 32px 28px; background: #fff; border: 1px solid #e1e7f0; border-radius: 16px; text-align: center; }
    h1 { font-size: 20px; margin: 0 0 10px; letter-spacing: -0.01em; }
    p { font-size: 15px; line-height: 1.55; color: #2d384e; margin: 0 0 18px; }
    .small { font-size: 13px; color: #5e6a81; margin: 14px 0 0; }
    button { font: inherit; font-weight: 600; font-size: 15px; color: #fff; background: #047857; border: 0; border-radius: 10px; padding: 11px 22px; cursor: pointer; }
    button:focus-visible { outline: 3px solid #34d399; outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      body { background: #06090e; color: #f0f4fa; }
      main { background: #10161f; border-color: #1e2735; }
      p { color: #c4cddc; } .small { color: #8f9baf; }
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${copy.body(business)}</p>
    ${form}
  </main>
</body>
</html>`;
}

/** True for the RFC 8058 one-click body a mail client sends (as opposed to our own confirmation form). */
export function isOneClickBody(body: string): boolean {
  return /(?:^|&)List-Unsubscribe=One-Click(?:&|$)/.test(body.trim());
}
