import { requireAccess } from '@/lib/business';
import { recordAudit, type AuditEntry } from '@/lib/audit';
import { logEvent } from '@/lib/log';

/**
 * Records an audit event as the signed-in member, for server actions that change configuration. Reuses the
 * per-request cached access lookup, so it adds no extra session or database round trip. Best effort, like
 * recordAudit itself: a failed audit write never blocks the change.
 */
export async function auditAsCurrentUser(
  action: AuditEntry['action'],
  details: Pick<AuditEntry, 'targetType' | 'targetId' | 'metadata'> = {}
): Promise<void> {
  try {
    const { business, userId, email } = await requireAccess();
    await recordAudit({ action, businessId: business.id, actorId: userId, actorEmail: email, ...details });
  } catch (e) {
    logEvent('audit', 'actor_lookup_failed', { action, reason: e instanceof Error ? e.message : String(e) }, 'error');
  }
}
