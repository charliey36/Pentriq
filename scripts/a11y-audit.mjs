#!/usr/bin/env node
/**
 * Accessibility and mobile audit of the public pages, against a running server.
 *
 *   node scripts/a11y-audit.mjs [baseUrl]            (default http://localhost:3000)
 *
 * For every page, at desktop width (1280px) in light and dark mode, and at phone width (390px):
 *   - axe-core WCAG 2.0/2.1 A and AA rules: "serious" and "critical" violations fail the run, others are listed;
 *   - no horizontal scrolling at phone width;
 *   - no uncaught JavaScript errors in the browser.
 * Signed-in pages need a database and are covered by the unit and database test suites instead.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const BASE = (process.argv[2] || process.env.AUDIT_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const PUBLIC_PATHS = [
  '/', '/pricing', '/about', '/contact', '/security', '/subprocessors', '/for', '/for/hair-salons', '/blog',
  '/blog/how-to-get-more-google-reviews', '/tools/review-gap-calculator', '/changelog', '/roadmap', '/privacy',
  '/terms', '/cookies', '/login', '/signup', '/forgot-password', '/review-unavailable', '/integrations/docs',
];

// Both themes: the app is dark unless the visitor chooses light (stored by the theme toggle under this key),
// and each theme needs its own contrast check.
const THEME_KEY = 'pentriq-theme';
const VIEWPORTS = [
  { name: 'desktop-light', width: 1280, height: 900, theme: 'light' },
  { name: 'desktop-dark', width: 1280, height: 900, theme: 'dark' },
  { name: 'phone', width: 390, height: 844, theme: 'light' },
];

const failures = [];
const notes = [];

const browser = await chromium.launch();
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: viewport.theme, reducedMotion: 'reduce' });
    await context.addInitScript(([key, theme]) => {
      try {
        localStorage.setItem(key, theme);
      } catch {
        /* storage unavailable: the page keeps its default theme */
      }
    }, [THEME_KEY, viewport.theme]);
    for (const path of PUBLIC_PATHS) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const where = `${path} [${viewport.name}]`;
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45_000 }).catch((e) => {
        failures.push(`${where}: could not load (${e.message.split('\n')[0]})`);
        return null;
      });
      if (!res) {
        await page.close();
        continue;
      }
      if (res.status() >= 400) failures.push(`${where}: HTTP ${res.status()}`);

      await page.addScriptTag({ path: AXE_PATH });
      const result = await page.evaluate(async () =>
        // eslint-disable-next-line no-undef
        axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })
      );
      for (const v of result.violations) {
        const targets = v.nodes
          .slice(0, 3)
          .map((n) => {
            const d = n.any?.[0]?.data;
            const colours = d && d.fgColor ? ` (${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}:1, needs ${d.expectedContrastRatio})` : '';
            return `${n.target.join(' ')}${colours}`;
          })
          .join(' | ');
        const line = `${where}: [${v.impact}] ${v.id} (${v.nodes.length}) ${v.help} -> ${targets}`;
        if (v.impact === 'serious' || v.impact === 'critical') failures.push(line);
        else notes.push(line);
      }

      if (viewport.name === 'phone') {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) failures.push(`${where}: page scrolls sideways by ${overflow}px at 390px wide`);
      }
      for (const e of errors) failures.push(`${where}: browser error: ${e}`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

for (const n of notes) console.log(`note  ${n}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`\n${PUBLIC_PATHS.length * VIEWPORTS.length} page views audited: ${failures.length} failure(s), ${notes.length} minor note(s)`);
process.exit(failures.length ? 1 : 0);
