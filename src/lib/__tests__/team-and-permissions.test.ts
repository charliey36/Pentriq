import { createHash } from 'crypto';
import { MiniDb } from './helpers/mini-db';
import { can, canAssign, canManageMember, CAPABILITIES } from '@/lib/permissions';
import { acceptInvitation, changeMemberRole, createInvitation, listTeam, lookupInvitation, MAX_TEAM_SIZE, removeMember, revokeInvitation } from '@/lib/team';

describe('permissions matrix', () => {
  it('owner holds every capability', () => {
    for (const c of CAPABILITIES) expect(can('owner', c)).toBe(true);
  });

  it('admin runs the business but cannot touch billing or delete the account', () => {
    expect(can('admin', 'settings.write')).toBe(true);
    expect(can('admin', 'team.manage')).toBe(true);
    expect(can('admin', 'billing.manage')).toBe(false);
    expect(can('admin', 'account.delete')).toBe(false);
  });

  it('staff can work with customers only', () => {
    expect(can('staff', 'customers.write')).toBe(true);
    for (const c of ['settings.write', 'integrations.manage', 'data.export', 'team.manage', 'billing.manage', 'account.delete'] as const) {
      expect(can('staff', c)).toBe(false);
    }
  });

  it('no role means no access', () => {
    expect(can(null, 'customers.read')).toBe(false);
    expect(can(undefined, 'customers.read')).toBe(false);
  });

  it('prevents privilege escalation: nobody mints an owner, and an admin cannot mint or manage an admin', () => {
    expect(canAssign('owner', 'owner')).toBe(false);
    expect(canAssign('admin', 'owner')).toBe(false);
    expect(canAssign('admin', 'admin')).toBe(false);
    expect(canAssign('admin', 'staff')).toBe(true);
    expect(canAssign('staff', 'staff')).toBe(false);
    expect(canManageMember('admin', 'owner')).toBe(false);
  });
});

// A fake auth admin API: user id -> email.
function makeDb(users: Record<string, string>) {
  const db = new MiniDb() as MiniDb & { auth: unknown };
  db.auth = { admin: { getUserById: async (id: string) => ({ data: { user: users[id] ? { email: users[id] } : null } }) } };
  return db;
}
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

describe('team invitations', () => {
  const base = { businessId: 'biz-1', actorId: 'owner-1', actorRole: 'owner' as const };

  function seed() {
    const db = makeDb({ 'owner-1': 'owner@shop.co.uk', 'staff-1': 'staff@shop.co.uk' });
    db.rows('businesses').push({ id: 'biz-1', owner_id: 'owner-1', name: 'Shop', onboarding_completed_at: '2026-01-01' });
    db.rows('business_members').push({ id: 'm1', business_id: 'biz-1', user_id: 'owner-1', role: 'owner', created_at: '2026-01-01' });
    db.rows('business_members').push({ id: 'm2', business_id: 'biz-1', user_id: 'staff-1', role: 'staff', created_at: '2026-01-02' });
    return db;
  }

  it('stores only a hash of the token and normalises the email', async () => {
    const db = seed();
    const res = await createInvitation(db as never, { ...base, email: '  New.Person@Shop.co.uk ', role: 'staff' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = db.rows('team_invitations')[0];
    expect(row.email).toBe('new.person@shop.co.uk');
    expect(row.token_hash).toBe(sha(res.token));
    expect(JSON.stringify(row)).not.toContain(res.token);
    expect(res.token.length).toBeGreaterThanOrEqual(40);
  });

  it('rejects bad emails, the owner role and unknown roles', async () => {
    const db = seed();
    expect((await createInvitation(db as never, { ...base, email: 'nope', role: 'staff' })).ok).toBe(false);
    expect((await createInvitation(db as never, { ...base, email: 'a@b.co', role: 'owner' })).ok).toBe(false);
    expect((await createInvitation(db as never, { ...base, email: 'a@b.co', role: 'superuser' })).ok).toBe(false);
  });

  it('an admin cannot invite another admin', async () => {
    const db = seed();
    const res = await createInvitation(db as never, { ...base, actorRole: 'admin', email: 'a@b.co', role: 'admin' });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('permission') });
  });

  it('refuses someone already on the team', async () => {
    const db = seed();
    const res = await createInvitation(db as never, { ...base, email: 'STAFF@shop.co.uk', role: 'staff' });
    expect(res).toEqual({ ok: false, error: 'That person is already on your team.' });
  });

  it('re-inviting replaces the earlier pending link', async () => {
    const db = seed();
    const first = await createInvitation(db as never, { ...base, email: 'a@b.co', role: 'staff' });
    const second = await createInvitation(db as never, { ...base, email: 'a@b.co', role: 'staff' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect((await lookupInvitation(db as never, first.token))?.state).toBe('revoked');
    expect((await lookupInvitation(db as never, second.token))?.state).toBe('valid');
  });

  it('caps team size including pending invitations', async () => {
    const db = seed();
    for (let i = 0; i < MAX_TEAM_SIZE - 2; i++) {
      expect((await createInvitation(db as never, { ...base, email: `p${i}@b.co`, role: 'staff' })).ok).toBe(true);
    }
    expect((await createInvitation(db as never, { ...base, email: 'extra@b.co', role: 'staff' })).ok).toBe(false);
  });

  it('listTeam returns member emails and only pending invitations', async () => {
    const db = seed();
    const a = await createInvitation(db as never, { ...base, email: 'a@b.co', role: 'staff' });
    await createInvitation(db as never, { ...base, email: 'c@b.co', role: 'staff' });
    if (a.ok) await revokeInvitation(db as never, { businessId: 'biz-1', invitationId: db.rows('team_invitations')[0].id, actorRole: 'owner' });
    const team = await listTeam(db as never, 'biz-1');
    expect(team.members.map((m) => m.email)).toEqual(['owner@shop.co.uk', 'staff@shop.co.uk']);
    expect(team.invitations.map((i) => i.email)).toEqual(['c@b.co']);
  });

  describe('accepting', () => {
    async function invited(email = 'new@shop.co.uk') {
      const db = seed();
      const res = await createInvitation(db as never, { ...base, email, role: 'admin' });
      if (!res.ok) throw new Error('setup');
      return { db, token: res.token };
    }

    it('adds the member with the invited role and consumes the link', async () => {
      const { db, token } = await invited();
      const res = await acceptInvitation(db as never, { token, userId: 'new-1', userEmail: 'New@Shop.co.uk' });
      expect(res).toEqual({ ok: true, businessId: 'biz-1' });
      expect(db.rows('business_members').find((m) => m.user_id === 'new-1')).toMatchObject({ business_id: 'biz-1', role: 'admin' });
      const again = await acceptInvitation(db as never, { token, userId: 'new-1', userEmail: 'new@shop.co.uk' });
      expect(again.ok).toBe(false); // used
    });

    it('refuses a different signed-in email (a forwarded link is useless)', async () => {
      const { db, token } = await invited();
      const res = await acceptInvitation(db as never, { token, userId: 'other', userEmail: 'attacker@evil.test' });
      expect(res.ok).toBe(false);
      expect(db.rows('business_members').some((m) => m.user_id === 'other')).toBe(false);
    });

    it('refuses expired, revoked and malformed tokens', async () => {
      const { db, token } = await invited();
      const later = new Date(Date.now() + 8 * 86_400_000);
      expect((await acceptInvitation(db as never, { token, userId: 'new-1', userEmail: 'new@shop.co.uk', now: later })).ok).toBe(false);
      expect(await lookupInvitation(db as never, 'short')).toBeNull();
      await revokeInvitation(db as never, { businessId: 'biz-1', invitationId: db.rows('team_invitations')[0].id, actorRole: 'owner' });
      expect((await acceptInvitation(db as never, { token, userId: 'new-1', userEmail: 'new@shop.co.uk' })).ok).toBe(false);
    });

    it('discards the empty business that signup auto-created, so the invitee is not stranded', async () => {
      const { db, token } = await invited();
      db.rows('businesses').push({ id: 'biz-new', owner_id: 'new-1', onboarding_completed_at: null, stripe_customer_id: null, trial_claimed_at: null });
      db.rows('business_members').push({ id: 'mx', business_id: 'biz-new', user_id: 'new-1', role: 'owner' });
      const res = await acceptInvitation(db as never, { token, userId: 'new-1', userEmail: 'new@shop.co.uk' });
      expect(res.ok).toBe(true);
      expect(db.rows('businesses').some((b) => b.id === 'biz-new')).toBe(false);
    });

    it('never discards a business that has customers or has been set up', async () => {
      const { db, token } = await invited();
      db.rows('businesses').push({ id: 'biz-real', owner_id: 'new-1', onboarding_completed_at: null, stripe_customer_id: null, trial_claimed_at: null });
      db.rows('business_members').push({ id: 'mx', business_id: 'biz-real', user_id: 'new-1', role: 'owner' });
      db.rows('customers').push({ id: 'c1', business_id: 'biz-real' });
      const res = await acceptInvitation(db as never, { token, userId: 'new-1', userEmail: 'new@shop.co.uk' });
      expect(res.ok).toBe(false);
      expect(db.rows('businesses').some((b) => b.id === 'biz-real')).toBe(true);
    });
  });

  describe('role changes and removal', () => {
    it('an owner can change staff to admin; you cannot change yourself', async () => {
      const db = seed();
      expect((await changeMemberRole(db as never, { businessId: 'biz-1', targetUserId: 'staff-1', newRole: 'admin', actorId: 'owner-1', actorRole: 'owner' })).ok).toBe(true);
      expect(db.rows('business_members').find((m) => m.user_id === 'staff-1')?.role).toBe('admin');
      expect((await changeMemberRole(db as never, { businessId: 'biz-1', targetUserId: 'owner-1', newRole: 'staff', actorId: 'owner-1', actorRole: 'owner' })).ok).toBe(false);
    });

    it('an admin cannot promote staff to admin or demote the owner', async () => {
      const db = seed();
      expect((await changeMemberRole(db as never, { businessId: 'biz-1', targetUserId: 'staff-1', newRole: 'admin', actorId: 'adm', actorRole: 'admin' })).ok).toBe(false);
      expect((await changeMemberRole(db as never, { businessId: 'biz-1', targetUserId: 'owner-1', newRole: 'staff', actorId: 'adm', actorRole: 'admin' })).ok).toBe(false);
    });

    it('never touches a member of another business', async () => {
      const db = seed();
      db.rows('business_members').push({ id: 'mz', business_id: 'biz-2', user_id: 'x', role: 'staff' });
      const res = await removeMember(db as never, { businessId: 'biz-1', targetUserId: 'x', actorId: 'owner-1', actorRole: 'owner' });
      expect(res.ok).toBe(false);
      expect(db.rows('business_members').some((m) => m.user_id === 'x')).toBe(true);
    });

    it('the owner cannot be removed by an admin, and nobody removes themselves', async () => {
      const db = seed();
      expect((await removeMember(db as never, { businessId: 'biz-1', targetUserId: 'owner-1', actorId: 'adm', actorRole: 'admin' })).ok).toBe(false);
      expect((await removeMember(db as never, { businessId: 'biz-1', targetUserId: 'owner-1', actorId: 'owner-1', actorRole: 'owner' })).ok).toBe(false);
      expect((await removeMember(db as never, { businessId: 'biz-1', targetUserId: 'staff-1', actorId: 'owner-1', actorRole: 'owner' })).ok).toBe(true);
    });
  });
});
