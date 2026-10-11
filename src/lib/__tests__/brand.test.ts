/**
 * Brand guard: the product is "Pentriq". This fails if the old name creeps
 * back into user-facing source, and checks the central brand constants and
 * that rendered emails carry the new name.
 */
import { afterEach, describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  APP_NAME,
  APP_NAME_ACCENT,
  APP_NAME_LEAD,
  APP_SLUG,
  APP_TITLE,
  DEFAULT_APP_URL,
  getAppUrl,
  senderDisplayName,
} from '../brand';
import { renderMessage } from '../templates';
import { buildNotificationEmail } from '../email';

const ROOT = join(__dirname, '..', '..', '..');
const OLD_NAME = /review[\s_-]?flow/i;

/** No allowances: the old name must not appear anywhere in these locations. */
const ALLOWED = new Set<string>();
const SCAN_DIRS = ['src', 'public', 'scripts', 'docs', 'supabase'];
const ROOT_DOC = /\.(md|txt)$/;
const TEXT_EXT = /\.(ts|tsx|js|mjs|json|svg|csv|css|md|txt)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(entry)) out.push(full);
  }
  return out;
}

describe('brand constants', () => {
  it('uses Pentriq as the single source of truth', () => {
    expect(APP_NAME).toBe('Pentriq');
    expect(APP_NAME_LEAD + APP_NAME_ACCENT).toBe(APP_NAME);
    expect(APP_SLUG).toBe('pentriq');
    expect(APP_TITLE.startsWith('Pentriq')).toBe(true);
    expect(senderDisplayName('Acme')).toBe('Acme via Pentriq');
  });
});

describe('public app URL', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it('defaults to the Pentriq deployment, never localhost', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(DEFAULT_APP_URL).toBe('https://pentriq.cloud');
    expect(getAppUrl()).toBe('https://pentriq.cloud');
    process.env.NEXT_PUBLIC_APP_URL = '';
    expect(getAppUrl()).toBe('https://pentriq.cloud');
  });

  it('honours an override and strips trailing slashes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.org/';
    expect(getAppUrl()).toBe('https://example.org');
  });

  it('hosted email assets (logo) use the public URL', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { html } = renderMessage('review_request', 'email', {
      businessName: 'Acme',
      customerName: 'Alex',
      publicReviewUrl: `${getAppUrl()}/api/track-message/m1`,
      privateFeedbackUrl: `${getAppUrl()}/feedback/m1`,
    });
    expect(html).toContain('https://pentriq.cloud/email-assets/logo-mark.png');
    expect(html).toContain('https://pentriq.cloud/api/track-message/m1');
    expect(html).not.toContain('localhost');
  });
});

describe('rendered output carries the Pentriq name', () => {
  const ctx = {
    businessName: 'Acme Coffee',
    customerName: 'Alex',
    publicReviewUrl: 'https://app.test/r',
    privateFeedbackUrl: 'https://app.test/f',
    unsubscribeUrl: 'https://app.test/u',
  };

  it('review request + reminder emails', () => {
    for (const purpose of ['review_request', 'review_reminder'] as const) {
      const { html, text } = renderMessage(purpose, 'email', ctx);
      expect(html).toContain('Sent via Pentriq');
      expect(html).toContain('Pentr<span');
      expect(text).toContain('Sent via Pentriq');
      expect(html).not.toMatch(OLD_NAME);
      expect(text).not.toMatch(OLD_NAME);
    }
  });

  it('other message emails use the Pentriq footer', () => {
    const { html } = renderMessage('rebooking_reminder', 'email', { ...ctx, rebookingUrl: 'https://app.test/b' });
    expect(html).toContain('via Pentriq');
    expect(html).not.toMatch(OLD_NAME);
  });

  it('welcome / campaign / trial notification emails', () => {
    for (const kind of ['welcome', 'campaign', 'trial_ending'] as const) {
      const { subject, html } = buildNotificationEmail(kind, 'Acme');
      expect(html).toContain('Pentriq');
      expect(`${subject} ${html}`).not.toMatch(OLD_NAME);
    }
    expect(buildNotificationEmail('welcome', 'Acme').subject).toBe('Welcome to Pentriq');
  });
});

describe('no remaining references to the old product name', () => {
  it('source, docs, migrations and root markdown are clean', () => {
    const offenders: string[] = [];
    const rootDocs = readdirSync(ROOT).filter((f) => ROOT_DOC.test(f)).map((f) => join(ROOT, f));
    const files = [...SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir))), ...rootDocs];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (OLD_NAME.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
