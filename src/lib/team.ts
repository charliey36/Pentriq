import { createHash, randomBytes } from 'crypto';
import type { AssignableRole, Role } from '@/lib/permissions';
import { canAssign, canManageMember, isRole } from '@/lib/permissions';

/**
 * Team management: invitations, acceptance, role changes and removal.
 *
 * All functions take an injected service-role client (`db`) so they are unit-testable. Invitation tokens are
 * 256-bit random values; only their SHA-256 hash is stored, so a database leak does not yield usable links.
 * The invitee must sign in with the invited email address, so a forwarded link is useless to anyone else.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from(table: string): any; auth?: { admin: { getUserById(id: string): Promise<{ data: { user: { email?: string | null } | null } }> } } };

export const INVITE_TTL_DAYS = 7;
export const MAX_TEAM_SIZE = 10; // members + pending invitations; a sensible ceiling until seat-based pricing exists
const EMAIL_RE = /^[^\s@<>"',;()]+@[^\s@<>"',;()]+\.[^\s@<>"',;()]+$/;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const normaliseEmail = (raw: string) => raw.trim().toLowerCase();

export type TeamResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

export type MemberView = { userId: string; email: string | null; role: Role; joinedAt: string };
export type InvitationView = { id: string; email: string; role: AssignableRole; expiresAt: string; createdAt: string };

export async function listTeam(db: Db, businessId: string): Promise<{ members: MemberView[]; invitations: InvitationView[] }> {
  const [{ data: members }, { data: invites }] = await Promise.all([
    db.from('business_members').select('user_id, role, created_at').eq('business_id', businessId).order('created_at', { ascending: true }),
    db
      .from('team_invitations')
      .select('id, email, role, expires_at, created_at')
      .eq('business_id', businessId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  ]);
  const views: MemberView[] = [];
  for (const m of (members ?? []) as { user_id: string; role: Role; created_at: string }[]) {
    let email: string | null = null;
    try {
      email = (await db.auth?.admin.getUserById(m.user_id))?.data.user?.email ?? null;
    } catch {
      email = null;
    }
    views.push({ userId: m.user_id, email, role: m.role, joinedAt: m.created_at });
  }
  return {
    members: views,
    invitations: ((invites ?? []) as any[]).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at, createdAt: i.created_at })),
  };
}

export async function createInvitation(
  db: Db,
  params: { businessId: string; email: string; role: string; actorId: string; actorRole: Role; now?: Date }
): Promise<TeamResult<{ token: string; email: string; role: AssignableRole }>> {
  const email = normaliseEmail(params.email);
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail('Enter a valid email address.');
  if (!isRole(params.role) || params.role === 'owner') return fail('Choose Admin or Staff.');
  const role = params.role as AssignableRole;
  if (!canAssign(params.actorRole, role)) return fail('You do not have permission to invite someone with that role.');

  const team = await listTeam(db, params.businessId);
  if (team.members.some((m) => m.email && normaliseEmail(m.email) === email)) return fail('That person is already on your team.');
  if (team.members.length + team.invitations.length >= MAX_TEAM_SIZE) return fail(`Teams are limited to ${MAX_TEAM_SIZE} people for now. Revoke an invitation or remove someone first.`);

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date((params.now ?? new Date()).getTime() + INVITE_TTL_DAYS * 86_400_000).toISOString();
  // Re-inviting the same address replaces the earlier pending invitation (and so invalidates its link).
  await db.from('team_invitations').update({ revoked_at: (params.now ?? new Date()).toISOString() }).eq('business_id', params.businessId).eq('email', email).is('accepted_at', null).is('revoked_at', null);
  const { error } = await db.from('team_invitations').insert({
    business_id: params.businessId,
    email,
    role,
    token_hash: hashToken(token),
    invited_by: params.actorId,
    expires_at: expiresAt,
  });
  if (error) return fail('Could not create the invitation. Please try again.');
  return { ok: true, token, email, role };
}

export async function revokeInvitation(db: Db, params: { businessId: string; invitationId: string; actorRole: Role }): Promise<TeamResult> {
  const { data: invite } = await db.from('team_invitations').select('id, role').eq('id', params.invitationId).eq('business_id', params.businessId).is('accepted_at', null).is('revoked_at', null).maybeSingle();
  if (!invite) return fail('That invitation no longer exists.');
  if (!canManageMember(params.actorRole, invite.role)) return fail('You do not have permission to revoke that invitation.');
  await db.from('team_invitations').update({ revoked_at: new Date().toISOString() }).eq('id', params.invitationId).eq('business_id', params.businessId);
  return { ok: true };
}

export type InvitationLookup = { businessId: string; businessName: string; email: string; role: AssignableRole; state: 'valid' | 'expired' | 'used' | 'revoked' };

/** Read-only lookup for the public /invite/[token] page. Reveals only the business name, invited email and role. */
export async function lookupInvitation(db: Db, token: string, now = new Date()): Promise<InvitationLookup | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data: invite } = await db.from('team_invitations').select('business_id, email, role, expires_at, accepted_at, revoked_at').eq('token_hash', hashToken(token)).maybeSingle();
  if (!invite) return null;
  const { data: business } = await db.from('businesses').select('name').eq('id', invite.business_id).maybeSingle();
  const state = invite.accepted_at ? 'used' : invite.revoked_at ? 'revoked' : new Date(invite.expires_at) <= now ? 'expired' : 'valid';
  return { businessId: invite.business_id, businessName: business?.name || 'a Pentriq business', email: invite.email, role: invite.role, state };
}

/**
 * Accepts an invitation for the signed-in user. A person belongs to at most one business, so if they already have
 * one the join is refused, with one exception: a brand-new empty business that signup created automatically (sole
 * member, onboarding not finished, no customers, no billing) is discarded so invitees are not stranded.
 */
export async function acceptInvitation(
  db: Db,
  params: { token: string; userId: string; userEmail: string | null; now?: Date }
): Promise<TeamResult<{ businessId: string }>> {
  const now = params.now ?? new Date();
  const lookup = await lookupInvitation(db, params.token, now);
  if (!lookup) return fail('This invitation link is not valid.');
  if (lookup.state === 'expired') return fail('This invitation has expired. Ask your team to send a new one.');
  if (lookup.state !== 'valid') return fail('This invitation has already been used or withdrawn.');
  if (!params.userEmail || normaliseEmail(params.userEmail) !== normaliseEmail(lookup.email)) {
    return fail(`This invitation was sent to ${lookup.email}. Sign in with that address to accept it.`);
  }

  const { data: existing } = await db.from('business_members').select('business_id, role').eq('user_id', params.userId).maybeSingle();
  if (existing && existing.business_id === lookup.businessId) return { ok: true, businessId: lookup.businessId };
  if (existing) {
    const discarded = await discardIfPristine(db, params.userId, existing.business_id, existing.role);
    if (!discarded) return fail('Your account already belongs to another business, and a person can only be on one team. Use a different email address for this invitation.');
  }

  const { error } = await db.from('business_members').insert({ business_id: lookup.businessId, user_id: params.userId, role: lookup.role });
  if (error) return fail('Could not join the team. Please try again.');
  // Conditional update: a second concurrent accept of the same link loses.
  await db.from('team_invitations').update({ accepted_at: now.toISOString() }).eq('token_hash', hashToken(params.token)).is('accepted_at', null);
  return { ok: true, businessId: lookup.businessId };
}

async function discardIfPristine(db: Db, userId: string, businessId: string, role: Role): Promise<boolean> {
  if (role !== 'owner') return false;
  const { data: business } = await db.from('businesses').select('id, owner_id, onboarding_completed_at, stripe_customer_id, trial_claimed_at').eq('id', businessId).maybeSingle();
  if (!business || business.owner_id !== userId || business.onboarding_completed_at || business.stripe_customer_id || business.trial_claimed_at) return false;
  const [members, customers] = await Promise.all([
    db.from('business_members').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ]);
  if ((members.count ?? 0) !== 1 || (customers.count ?? 0) !== 0) return false;
  const { error } = await db.from('businesses').delete().eq('id', businessId);
  return !error;
}

export async function changeMemberRole(
  db: Db,
  params: { businessId: string; targetUserId: string; newRole: string; actorId: string; actorRole: Role }
): Promise<TeamResult> {
  if (!isRole(params.newRole) || params.newRole === 'owner') return fail('Choose Admin or Staff.');
  if (params.targetUserId === params.actorId) return fail('You cannot change your own role.');
  const { data: target } = await db.from('business_members').select('role').eq('business_id', params.businessId).eq('user_id', params.targetUserId).maybeSingle();
  if (!target) return fail('That person is not on your team.');
  if (!canManageMember(params.actorRole, target.role) || !canAssign(params.actorRole, params.newRole)) return fail('You do not have permission to make that change.');
  const { error } = await db.from('business_members').update({ role: params.newRole }).eq('business_id', params.businessId).eq('user_id', params.targetUserId);
  return error ? fail('Could not update the role. Please try again.') : { ok: true };
}

export async function removeMember(
  db: Db,
  params: { businessId: string; targetUserId: string; actorId: string; actorRole: Role }
): Promise<TeamResult> {
  if (params.targetUserId === params.actorId) return fail('You cannot remove yourself. Ask the owner, or close the account from Data & privacy.');
  const { data: target } = await db.from('business_members').select('role').eq('business_id', params.businessId).eq('user_id', params.targetUserId).maybeSingle();
  if (!target) return fail('That person is not on your team.');
  if (!canManageMember(params.actorRole, target.role)) return fail('You do not have permission to remove that person.');
  const { error } = await db.from('business_members').delete().eq('business_id', params.businessId).eq('user_id', params.targetUserId);
  return error ? fail('Could not remove that person. Please try again.') : { ok: true };
}
