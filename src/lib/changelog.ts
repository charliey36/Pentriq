/** Changelog helpers: grouping for the page and the weekly digest paragraph. Pure; no AI, no I/O. */

export type ChangelogTag = 'New' | 'Improved' | 'Infrastructure';
export type ChangelogEntry = { id: string; title: string; description: string; tag: ChangelogTag; entry_date: string };

/** Monday (YYYY-MM-DD) of the week containing an ISO date. Weeks start on Monday, in UTC. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

export type ChangelogMonth = { month: string; weeks: { weekOf: string; label: string; entries: ChangelogEntry[] }[] };

/** Newest first: month → week (labelled "Week of 12 October") → entries. */
export function groupChangelog(entries: ChangelogEntry[]): ChangelogMonth[] {
  const sorted = [...entries].sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : a.title.localeCompare(b.title)));
  const months: ChangelogMonth[] = [];
  for (const e of sorted) {
    const month = fmt(e.entry_date, { month: 'long', year: 'numeric' });
    const weekOf = weekStart(e.entry_date);
    let m = months.find((x) => x.month === month);
    if (!m) months.push((m = { month, weeks: [] }));
    let w = m.weeks.find((x) => x.weekOf === weekOf);
    if (!w) m.weeks.push((w = { weekOf, label: `Week of ${fmt(weekOf, { day: 'numeric', month: 'long' })}`, entries: [] }));
    w.entries.push(e);
  }
  return months;
}

const joinList = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
/** Top-level join always uses a comma before "and", so titles that contain "and" stay unambiguous. */
const joinPhrases = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`);

/**
 * "What's New This Week": a fixed-template paragraph built from entry titles, grouped by tag.
 * Titles are used exactly as written (never re-cased, so "Stripe" stays "Stripe"), so write
 * them as short noun phrases: "Stripe billing integration", "faster customer import".
 */
export function buildDigest(entries: Pick<ChangelogEntry, 'title' | 'tag'>[]): string {
  if (entries.length === 0) return '';
  const titles = (tag: ChangelogTag) => entries.filter((e) => e.tag === tag).map((e) => e.title.trim().replace(/[.\s]+$/, ''));
  const parts = [
    ['introduced', titles('New')],
    ['improved', titles('Improved')],
    ['updated', titles('Infrastructure')],
  ].filter(([, t]) => t.length > 0) as [string, string[]][];
  const phrases = parts.map(([verb, t]) => `${verb} ${joinList(t)}`);
  return `This week we ${joinPhrases(phrases)}.`;
}
