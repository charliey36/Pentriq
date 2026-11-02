/**
 * Ranking for the command palette. Better than "contains": an exact or prefix match on the label wins, then
 * a match at the start of any word ("rep" finds "Executive report"), then keywords, then a loose in-order
 * subsequence ("csimp" finds "Import customers from CSV" via its keywords). Returns 0 for no match.
 */
export function scoreCommand(query: string, label: string, keywords = ''): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const l = label.toLowerCase();
  const k = keywords.toLowerCase();

  if (l === q) return 1000;
  if (l.startsWith(q)) return 900 - Math.min(100, l.length - q.length);
  const words = l.split(/[\s&/,-]+/);
  if (words.some((w) => w.startsWith(q))) return 800;
  if (l.includes(q)) return 700;

  // Every query word must appear somewhere (label or keywords): "google reply" matches "Reviews" via keywords.
  const terms = q.split(/\s+/).filter(Boolean);
  const haystack = `${l} ${k}`;
  if (terms.every((t) => haystack.split(/[\s&/,-]+/).some((w) => w.startsWith(t)))) return 600 - terms.length;
  if (terms.every((t) => haystack.includes(t))) return 500;

  // Subsequence over the label: characters in order, rewarding tight runs.
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (let j = 0; j < l.length && i < q.length; j++) {
    if (l[j] === q[i]) {
      if (last >= 0 && j - last > 1) gaps += 1;
      last = j;
      i += 1;
    }
  }
  if (i === q.length && q.length >= 3) return Math.max(1, 300 - gaps * 20);
  return 0;
}

export function rankCommands<T extends { label: string; keywords?: string }>(items: T[], query: string): T[] {
  if (!query.trim()) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreCommand(query, item.label, item.keywords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
}

/** Most-recent-first list of ids, de-duplicated and capped. */
export function pushRecent(recent: string[], id: string, max = 5): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, max);
}

export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length < 80).slice(0, 5) : [];
  } catch {
    return [];
  }
}
