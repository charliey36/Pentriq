'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAudit, type AuditAction } from '@/lib/audit';
import { logEvent } from '@/lib/log';

/**
 * Account-level security actions. These deliberately do not call requireAccess(): a member whose organisation
 * requires two-factor must be able to reach them before they have set it up. Each one acts only on the
 * signed-in user's own account.
 */

async function signedInUser() {
  const supabase = createClient();
  // getUser() asks the auth server (not the cookie), so factor information here is authoritative.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { supabase, user: data.user };
}

async function auditForUser(userId: string, email: string | null | undefined, action: AuditAction, metadata?: Record<string, string | number | boolean | null>) {
  const admin = createAdminClient();
  const { data: membership } = await admin.from('business_members').select('business_id').eq('user_id', userId).maybeSingle();
  await recordAudit({ action, businessId: membership?.business_id ?? null, actorId: userId, actorEmail: email ?? null, targetType: 'user', targetId: userId, metadata });
}

export type SyncResult = { ok: boolean; enrolled: boolean; error?: string };

/**
 * Re-reads the user's factors from the auth server and records whether two-factor is set up in app_metadata
 * (service role only, signed into the next access token). The sign-in gate trusts only that claim; see lib/mfa.ts.
 * Call after enrolling or removing an authenticator, then refresh the session.
 */
export async function syncMfaEnrollment(): Promise<SyncResult> {
  const { user } = await signedInUser();
  const enrolled = (user.factors ?? []).some((f) => f.factor_type === 'totp' && f.status === 'verified');
  const previous = user.app_metadata?.mfa_enrolled === true;
  if (enrolled === previous) return { ok: true, enrolled };

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), mfa_enrolled: enrolled },
  });
  if (error) {
    logEvent('auth', 'mfa_flag_update_failed', { reason: error.message }, 'error');
    return { ok: false, enrolled: previous, error: 'Could not save your two-factor setting. Please try again.' };
  }
  await auditForUser(user.id, user.email, enrolled ? 'security.mfa_enrolled' : 'security.mfa_removed');
  return { ok: true, enrolled };
}

export async function recordPasswordChanged(): Promise<void> {
  const { user } = await signedInUser();
  await auditForUser(user.id, user.email, 'security.password_changed');
}

export type SessionsResult = { ok: boolean; message: string };

/** Signs the user out of their other devices ('others') or everywhere including here ('global'). */
export async function revokeSessions(scope: 'others' | 'global'): Promise<SessionsResult> {
  if (scope !== 'others' && scope !== 'global') return { ok: false, message: 'Unknown option.' };
  const { supabase, user } = await signedInUser();
  const { error } = await supabase.auth.signOut({ scope });
  if (error) return { ok: false, message: 'Could not sign out your other sessions. Please try again.' };
  await auditForUser(user.id, user.email, 'security.sessions_revoked', { scope });
  if (scope === 'global') redirect('/login');
  return { ok: true, message: 'Signed out of every other device. This one stays signed in.' };
}
