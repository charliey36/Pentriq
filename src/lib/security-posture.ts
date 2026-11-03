/**
 * Security posture for a business: a short checklist an owner (or a customer's IT reviewer) can read in a
 * minute. Each check is derived from configuration Pentriq already holds; nothing is guessed.
 */
export type PostureInput = {
  members: Array<{ role: 'owner' | 'admin' | 'staff' }>;
  pendingInvites: number;
  expiredInvites: number;
  apiKey: { active: boolean; createdAt: string | null } | null;
  webhook: { active: boolean; disabledReason: string | null } | null;
  retentionDays: number | null;
  hasContactEmail: boolean;
  googleStatus: 'active' | 'needs_reconnect' | 'pending_location' | null;
  /** Audit events in the last 30 days (shows the trail is working). */
  auditEvents30d: number;
  /** Two-factor coverage; omitted when the auth server could not be asked. */
  mfa?: { required: boolean; enrolled: number; members: number };
};

export type PostureCheck = {
  id: string;
  status: 'ok' | 'warn' | 'info';
  title: string;
  detail: string;
  href?: string;
};

const DAY_MS = 86_400_000;
export const API_KEY_ROTATION_DAYS = 180;

export function assessPosture(i: PostureInput, now: Date = new Date()): { checks: PostureCheck[]; score: number } {
  const checks: PostureCheck[] = [];
  const admins = i.members.filter((m) => m.role === 'admin').length;
  const staff = i.members.filter((m) => m.role === 'staff').length;

  checks.push({
    id: 'roles',
    status: i.members.length > 1 && admins === 0 ? 'info' : 'ok',
    title: 'Least-privilege roles',
    detail: `${i.members.length} member${i.members.length === 1 ? '' : 's'}: 1 owner, ${admins} admin${admins === 1 ? '' : 's'}, ${staff} staff. Staff cannot change settings, billing, integrations or export data, and the database enforces it for configuration tables.`,
    href: '/settings/team',
  });

  if (i.mfa) {
    const { required, enrolled, members } = i.mfa;
    const all = members > 0 && enrolled >= members;
    checks.push({
      id: 'mfa',
      status: required ? (all ? 'ok' : 'info') : all ? 'ok' : 'warn',
      title: 'Two-factor authentication',
      detail: required
        ? `Required for everyone. ${enrolled} of ${members} member${members === 1 ? ' has' : 's have'} it on; anyone without it must set it up at their next visit.`
        : `${enrolled} of ${members} member${members === 1 ? ' has' : 's have'} it on. Require it for everyone below so a stolen password is never enough.`,
      href: '/settings/security#two-factor',
    });
  }

  if (i.pendingInvites > 0 || i.expiredInvites > 0) {
    checks.push({
      id: 'invites',
      status: i.expiredInvites > 0 ? 'warn' : 'info',
      title: 'Open invitations',
      detail: `${i.pendingInvites} pending${i.expiredInvites ? `, ${i.expiredInvites} expired` : ''}. Revoke any you no longer need; links are single-use and expire after 7 days.`,
      href: '/settings/team',
    });
  }

  if (i.apiKey?.active) {
    const ageDays = i.apiKey.createdAt ? Math.floor((now.getTime() - new Date(i.apiKey.createdAt).getTime()) / DAY_MS) : null;
    const stale = ageDays !== null && ageDays > API_KEY_ROTATION_DAYS;
    checks.push({
      id: 'api-key',
      status: stale ? 'warn' : 'ok',
      title: 'API key',
      detail: stale
        ? `Active and ${ageDays} days old. Rotate keys at least every ${API_KEY_ROTATION_DAYS} days.`
        : `Active${ageDays !== null ? `, created ${ageDays} days ago` : ''}. Stored only as a hash.`,
      href: '/settings/integrations',
    });
  }

  if (i.webhook) {
    checks.push({
      id: 'webhook',
      status: i.webhook.active ? 'ok' : 'warn',
      title: 'Outbound webhook',
      detail: i.webhook.active
        ? 'HTTPS only, signed with HMAC-SHA256, blocked from internal addresses.'
        : `Switched off${i.webhook.disabledReason ? `: ${i.webhook.disabledReason}` : ''}.`,
      href: '/settings/integrations',
    });
  }

  checks.push({
    id: 'retention',
    status: i.retentionDays === null ? 'info' : 'ok',
    title: 'Data retention',
    detail:
      i.retentionDays === null
        ? 'No retention limit set: message history is kept until the account is deleted. Setting a limit supports GDPR storage limitation.'
        : `Message history and tracking events older than ${i.retentionDays} days are deleted nightly.`,
  });

  if (i.googleStatus === 'needs_reconnect') {
    checks.push({ id: 'google', status: 'warn', title: 'Google connection', detail: 'Google access has expired. Reconnect to resume review sync and replies.', href: '/settings/integrations' });
  }

  checks.push({
    id: 'replies',
    status: i.hasContactEmail ? 'ok' : 'warn',
    title: 'Customer replies',
    detail: i.hasContactEmail ? 'Replies to review emails reach your own inbox.' : 'No contact email: customer replies go nowhere. Add one in General settings.',
    href: '/settings',
  });

  checks.push({
    id: 'audit',
    status: 'ok',
    title: 'Audit trail',
    detail: `${i.auditEvents30d} security-relevant event${i.auditEvents30d === 1 ? '' : 's'} recorded in the last 30 days. IP addresses are stored only as a hash.`,
  });

  const weights = { ok: 1, info: 0.6, warn: 0 } as const;
  const score = Math.round((checks.reduce((s, c) => s + weights[c.status], 0) / checks.length) * 100);
  return { checks, score };
}
