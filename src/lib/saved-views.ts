/**
 * Saved views: named filters a team can share ("Failed this week", "Never asked"). The stored query is
 * re-parsed through the owning screen's own URL-state parser, so a saved view can only ever contain values
 * that screen accepts.
 */
import { DEFAULT_STATE, parseListState, serializeListState } from '@/lib/customer-list';

export const SAVED_VIEW_SCOPES = ['customers', 'segments', 'activity', 'feedback'] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];
export const MAX_VIEWS_PER_SCOPE = 20;

export type SavedView = { id: string; name: string; query: string; shared: boolean; created_by: string | null };

export const SCOPE_PATHS: Record<SavedViewScope, string> = {
  customers: '/customers',
  segments: '/segments',
  activity: '/activity',
  feedback: '/feedback-inbox',
};

const ALLOWED_PARAMS: Record<Exclude<SavedViewScope, 'customers'>, string[]> = {
  segments: ['preset', 'rules', 'segment'],
  activity: ['type', 'days'],
  feedback: ['view', 'topic'],
};

/** Canonical query string for a scope, or null when nothing meaningful remains. */
export function normaliseViewQuery(scope: SavedViewScope, raw: string): string | null {
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  if (scope === 'customers') {
    const state = parseListState(params);
    const qs = serializeListState(state);
    return qs || (JSON.stringify(state) === JSON.stringify(DEFAULT_STATE) ? '' : null);
  }
  const out = new URLSearchParams();
  for (const key of ALLOWED_PARAMS[scope]) {
    const value = params.get(key);
    if (value) out.set(key, value.slice(0, 300));
  }
  return out.toString();
}

export type ViewInput = { scope: unknown; name: unknown; query: unknown };

export function validateView(input: ViewInput): { ok: true; scope: SavedViewScope; name: string; query: string } | { ok: false; error: string } {
  if (typeof input.scope !== 'string' || !(SAVED_VIEW_SCOPES as readonly string[]).includes(input.scope)) return { ok: false, error: 'Unknown view type.' };
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : '';
  if (!name) return { ok: false, error: 'Give the view a name.' };
  if (name.length > 60) return { ok: false, error: 'Names can be up to 60 characters.' };
  const query = normaliseViewQuery(input.scope as SavedViewScope, typeof input.query === 'string' ? input.query : '');
  if (query === null || query.length > 500) return { ok: false, error: 'That filter cannot be saved.' };
  return { ok: true, scope: input.scope as SavedViewScope, name, query };
}

export function viewHref(scope: SavedViewScope, query: string): string {
  return `${SCOPE_PATHS[scope]}${query ? `?${query}` : ''}`;
}
