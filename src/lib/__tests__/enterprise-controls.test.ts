/** @jest-environment node */
import { MiniDb } from './helpers/mini-db';
import { applyRetention, describeRetention, parseRetentionDays, retentionCutoff, RETENTION_OPTIONS } from '../retention';
import { normaliseViewQuery, validateView, viewHref } from '../saved-views';
import { assessPosture, type PostureInput } from '../security-posture';
import { parseRecent, pushRecent, rankCommands, scoreCommand } from '../command-search';
import { GO_SHORTCUTS, isTypingTarget, resolveGo, shortcutHintFor } from '../shortcuts';

const NOW = new Date('2026-11-02T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe('data retention', () => {
  it('validates the policy', () => {
    expect(parseRetentionDays('')).toEqual({ ok: true, days: null });
    expect(parseRetentionDays('365')).toEqual({ ok: true, days: 365 });
    expect(parseRetentionDays('30')).toMatchObject({ ok: false });
    expect(parseRetentionDays('99999')).toMatchObject({ ok: false });
    expect(parseRetentionDays('12.5')).toMatchObject({ ok: false });
    for (const o of RETENTION_OPTIONS) expect(parseRetentionDays(o.days === null ? '' : String(o.days)).ok).toBe(true);
  });

  it('computes the cutoff and describes the policy', () => {
    expect(retentionCutoff(365, NOW)).toBe(daysAgo(365));
    expect(describeRetention(null)).toMatch(/kept until/);
    expect(describeRetention(365)).toMatch(/older than 1 year/);
  });

  it('deletes only old, finished rows for that business, and nothing when there is no policy', async () => {
    const db = new MiniDb();
    db.rows('messages').push(
      { id: 'old-sent', business_id: 'b1', status: 'sent', created_at: daysAgo(400) },
      { id: 'old-queued', business_id: 'b1', status: 'queued', created_at: daysAgo(400) },
      { id: 'new-sent', business_id: 'b1', status: 'sent', created_at: daysAgo(10) },
      { id: 'other-biz', business_id: 'b2', status: 'sent', created_at: daysAgo(400) }
    );
    db.rows('interaction_events').push(
      { id: 'e1', business_id: 'b1', occurred_at: daysAgo(500) },
      { id: 'e2', business_id: 'b1', occurred_at: daysAgo(5) }
    );
    db.rows('private_feedback').push({ id: 'f1', business_id: 'b1', created_at: daysAgo(900) });

    const none = await applyRetention(db as never, { id: 'b1', data_retention_days: null }, NOW);
    expect(none.deleted).toEqual({});
    expect(db.rows('messages')).toHaveLength(4);

    const r = await applyRetention(db as never, { id: 'b1', data_retention_days: 365 }, NOW);
    expect(r.errors).toEqual([]);
    expect(r.deleted.messages).toBe(1);
    expect(r.deleted.interaction_events).toBe(1);
    expect(db.rows('messages').map((m) => m.id).sort()).toEqual(['new-sent', 'old-queued', 'other-biz']);
    expect(db.rows('interaction_events').map((e) => e.id)).toEqual(['e2']);
    // Core records are never part of the policy.
    expect(db.rows('private_feedback')).toHaveLength(1);
  });

  it('ignores an out-of-range stored value instead of purging', async () => {
    const db = new MiniDb();
    db.rows('messages').push({ id: 'm', business_id: 'b1', status: 'sent', created_at: daysAgo(40) });
    await applyRetention(db as never, { id: 'b1', data_retention_days: 7 }, NOW);
    expect(db.rows('messages')).toHaveLength(1);
  });
});

describe('saved views', () => {
  it('normalises customer list queries through the list parser', () => {
    expect(normaliseViewQuery('customers', '?status=failed&evil=1')).toBe('status=failed');
    expect(normaliseViewQuery('customers', 'status=nope')).toBe('');
    expect(normaliseViewQuery('feedback', 'view=overdue&topic=staff&x=1')).toBe('view=overdue&topic=staff');
    expect(normaliseViewQuery('activity', 'type=visit&days=90')).toBe('type=visit&days=90');
  });

  it('validates names and scopes', () => {
    expect(validateView({ scope: 'customers', name: '  Failed  this week ', query: '?status=failed' })).toEqual({ ok: true, scope: 'customers', name: 'Failed this week', query: 'status=failed' });
    expect(validateView({ scope: 'billing', name: 'x', query: '' })).toMatchObject({ ok: false });
    expect(validateView({ scope: 'customers', name: '', query: '' })).toMatchObject({ ok: false });
    expect(validateView({ scope: 'customers', name: 'x'.repeat(61), query: '' })).toMatchObject({ ok: false });
  });

  it('builds links', () => {
    expect(viewHref('customers', 'status=held')).toBe('/customers?status=held');
    expect(viewHref('feedback', '')).toBe('/feedback-inbox');
  });
});

describe('security posture', () => {
  const base: PostureInput = {
    members: [{ role: 'owner' }, { role: 'admin' }, { role: 'staff' }],
    pendingInvites: 0,
    expiredInvites: 0,
    apiKey: { active: true, createdAt: daysAgo(30) },
    webhook: { active: true, disabledReason: null },
    retentionDays: 365,
    hasContactEmail: true,
    googleStatus: 'active',
    auditEvents30d: 4,
  };

  it('scores a clean setup at 100', () => {
    const { score, checks } = assessPosture(base, NOW);
    expect(score).toBe(100);
    expect(checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('flags stale keys, disabled webhooks, expired invites and reconnects', () => {
    const { checks, score } = assessPosture(
      { ...base, apiKey: { active: true, createdAt: daysAgo(400) }, webhook: { active: false, disabledReason: 'too many failures' }, expiredInvites: 2, googleStatus: 'needs_reconnect', hasContactEmail: false },
      NOW
    );
    const warn = checks.filter((c) => c.status === 'warn').map((c) => c.id).sort();
    expect(warn).toEqual(['api-key', 'google', 'invites', 'replies', 'webhook']);
    expect(score).toBeLessThan(60);
  });

  it('treats no retention limit as advice, not a failure', () => {
    expect(assessPosture({ ...base, retentionDays: null }, NOW).checks.find((c) => c.id === 'retention')?.status).toBe('info');
  });
});

describe('command palette ranking', () => {
  const items = [
    { label: 'Dashboard', keywords: 'home overview' },
    { label: 'Executive report', keywords: 'kpi summary print' },
    { label: 'Import customers from CSV', keywords: 'upload bulk spreadsheet' },
    { label: 'Reviews', keywords: 'google ratings replies' },
  ];

  it('prefers prefix, then word-start, then keyword matches', () => {
    expect(scoreCommand('dash', 'Dashboard')).toBeGreaterThan(scoreCommand('rep', 'Executive report'));
    expect(rankCommands(items, 'rep').map((i) => i.label)[0]).toBe('Executive report');
    expect(rankCommands(items, 'google replies').map((i) => i.label)).toEqual(['Reviews']);
    expect(rankCommands(items, 'spreadsheet').map((i) => i.label)).toEqual(['Import customers from CSV']);
  });

  it('supports loose subsequences and rejects junk', () => {
    expect(scoreCommand('dshb', 'Dashboard')).toBeGreaterThan(0);
    expect(scoreCommand('zzz', 'Dashboard')).toBe(0);
    expect(rankCommands(items, '')).toEqual(items);
  });

  it('remembers recent commands safely', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['1', '2', '3', '4', '5'], '6')).toEqual(['6', '1', '2', '3', '4']);
    expect(parseRecent('["a",1,"b"]')).toEqual(['a', 'b']);
    expect(parseRecent('{bad json')).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });
});

describe('keyboard shortcuts', () => {
  it('maps g-sequences to unique destinations', () => {
    expect(new Set(GO_SHORTCUTS.map((s) => s.key)).size).toBe(GO_SHORTCUTS.length);
    expect(resolveGo('C')?.href).toBe('/customers');
    expect(resolveGo('q')).toBeNull();
    expect(shortcutHintFor('/insights')).toBe('G then I');
    expect(shortcutHintFor('/nowhere')).toBeUndefined();
  });

  it('stays out of the way while typing', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
