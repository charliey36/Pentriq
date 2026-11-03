import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/log';

/**
 * Append-only audit trail (table `audit_log`, migration 0039) for security-relevant actions.
 * Best effort by design: a failure to write the audit row is logged but never blocks the user's action.
 * Never put secrets or customer personal data in `metadata`; ids and counts only.
 */
export type AuditAction =
  | 'api_key.regenerated'
  | 'account.exported'
  | 'account.deleted'
  | 'customers.imported'
  | 'admin.organisation_deleted'
  | 'team.invited'
  | 'team.invitation_revoked'
  | 'team.joined'
  | 'team.role_changed'
  | 'team.member_removed'
  | 'webhook.configured'
  | 'webhook.secret_rotated'
  | 'webhook.deleted'
  | 'feedback.bulk_updated'
  | 'segment.campaign_sent'
  | 'settings.retention_changed'
  | 'saved_view.created'
  | 'saved_view.deleted'
  | 'audit.exported'
  | 'security.mfa_enrolled'
  | 'security.mfa_removed'
  | 'security.mfa_policy_changed'
  | 'security.sessions_revoked'
  | 'security.password_changed'
  | 'team.mfa_reset'
  | 'customer.exported'
  | 'customer.erased'
  | 'settings.updated'
  | 'services.changed'
  | 'loyalty.changed'
  | 'integration.connected'
  | 'integration.disconnected';

export type AuditEntry = {
  action: AuditAction;
  businessId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  /** Raw client IP; stored only as a salted-free SHA-256 prefix. */
  ip?: string | null;
};

type Inserter = { from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }> } };

export function hashIp(ip: string | null | undefined): string | null {
  return ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : null;
}

export async function recordAudit(entry: AuditEntry, db?: Inserter): Promise<void> {
  try {
    // Created inside the try: a missing service key or other set-up problem must never fail the user's action.
    const client = db ?? (createAdminClient() as unknown as Inserter);
    const { error } = await client.from('audit_log').insert({
      business_id: entry.businessId ?? null,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
      ip_hash: hashIp(entry.ip),
    });
    if (error) logEvent('audit', 'write_failed', { action: entry.action, reason: error.message }, 'error');
  } catch (e) {
    logEvent('audit', 'write_failed', { action: entry.action, reason: e instanceof Error ? e.message : String(e) }, 'error');
  }
}
