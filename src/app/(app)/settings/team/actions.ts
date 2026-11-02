'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireCapability } from '@/lib/business-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAudit } from '@/lib/audit';
import { getAppUrl } from '@/lib/brand';
import { sendTeamInviteEmail } from '@/lib/email';
import { requesterId, withinLimit } from '@/lib/rate-limit';
import { logEvent } from '@/lib/log';
import { changeMemberRole, createInvitation, INVITE_TTL_DAYS, removeMember, revokeInvitation } from '@/lib/team';

export type TeamActionResult = { error?: string; success?: boolean; message?: string };

// Invitations send email, so cap them per business to prevent the form being used to spam addresses.
const INVITES_PER_HOUR = { limit: 20, windowSeconds: 3600 };

const db = () => createAdminClient() as never;

export async function inviteMember(_prev: TeamActionResult, formData: FormData): Promise<TeamActionResult> {
  const { business, userId, email: actorEmail, role } = await requireCapability('team.manage');
  if (!(await withinLimit('team-invite', business.id, INVITES_PER_HOUR))) {
    return { error: 'Too many invitations in the last hour. Please try again later.' };
  }
  const result = await createInvitation(db(), {
    businessId: business.id,
    email: String(formData.get('email') ?? ''),
    role: String(formData.get('role') ?? ''),
    actorId: userId,
    actorRole: role,
  });
  if (!result.ok) return { error: result.error };

  const acceptUrl = `${getAppUrl()}/invite/${result.token}`;
  try {
    await sendTeamInviteEmail(result.email, { businessName: business.name, inviterEmail: actorEmail, role: result.role, acceptUrl, expiresInDays: INVITE_TTL_DAYS });
  } catch (e) {
    logEvent('email', 'team_invite_send_failed', { reason: e instanceof Error ? e.message : String(e) }, 'error');
    // The invitation exists but the email failed: say so, so the owner can revoke and retry rather than wait.
    return { error: 'The invitation was created but the email could not be sent. Revoke it and try again.' };
  }
  await recordAudit({
    action: 'team.invited', businessId: business.id, actorId: userId, actorEmail,
    targetType: 'invitation', metadata: { role: result.role }, ip: requesterId(headers()),
  });
  revalidatePath('/settings/team');
  return { success: true, message: `Invitation sent to ${result.email}.` };
}

export async function revokeInvite(invitationId: string): Promise<TeamActionResult> {
  const { business, userId, email, role } = await requireCapability('team.manage');
  const result = await revokeInvitation(db(), { businessId: business.id, invitationId, actorRole: role });
  if (!result.ok) return { error: result.error };
  await recordAudit({ action: 'team.invitation_revoked', businessId: business.id, actorId: userId, actorEmail: email, targetType: 'invitation', targetId: invitationId });
  revalidatePath('/settings/team');
  return { success: true };
}

export async function updateMemberRole(targetUserId: string, newRole: string): Promise<TeamActionResult> {
  const { business, userId, email, role } = await requireCapability('team.manage');
  const result = await changeMemberRole(db(), { businessId: business.id, targetUserId, newRole, actorId: userId, actorRole: role });
  if (!result.ok) return { error: result.error };
  await recordAudit({ action: 'team.role_changed', businessId: business.id, actorId: userId, actorEmail: email, targetType: 'user', targetId: targetUserId, metadata: { role: newRole } });
  revalidatePath('/settings/team');
  return { success: true };
}

export async function removeTeamMember(targetUserId: string): Promise<TeamActionResult> {
  const { business, userId, email, role } = await requireCapability('team.manage');
  const result = await removeMember(db(), { businessId: business.id, targetUserId, actorId: userId, actorRole: role });
  if (!result.ok) return { error: result.error };
  await recordAudit({ action: 'team.member_removed', businessId: business.id, actorId: userId, actorEmail: email, targetType: 'user', targetId: targetUserId });
  revalidatePath('/settings/team');
  return { success: true };
}

