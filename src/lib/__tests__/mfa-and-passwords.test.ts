/** @jest-environment node */
import { MiniDb } from './helpers/mini-db';
import { enrolledFromClaims, friendlyFactorName, gateRedirect, mfaGate, normaliseTotpCode } from '../mfa';
import { checkPassword, passwordStrength, PASSWORD_MAX_LENGTH } from '../password-policy';
import { assessPosture } from '../security-posture';
import { listTeam, resetMemberMfa } from '../team';

describe('two-factor gate', () => {
  it('lets aal2 sessions through whatever the policy', () => {
    expect(mfaGate({ aal: 'aal2', userEnrolled: true, orgRequires: true })).toBe('ok');
  });

  it('asks enrolled users for a code when they signed in with a password only', () => {
    expect(mfaGate({ aal: 'aal1', userEnrolled: true, orgRequires: false })).toBe('verify');
    expect(mfaGate({ aal: 'aal1', userEnrolled: true, orgRequires: true })).toBe('verify');
  });

  it('sends unenrolled users to set-up only when the organisation requires it', () => {
    expect(mfaGate({ aal: 'aal1', userEnrolled: false, orgRequires: true })).toBe('enroll');
    expect(mfaGate({ aal: 'aal1', userEnrolled: false, orgRequires: false })).toBe('ok');
    expect(mfaGate({ aal: null, userEnrolled: false, orgRequires: false })).toBe('ok');
  });

  it('builds safe redirect targets', () => {
    expect(gateRedirect('verify', '/customers?status=failed')).toBe('/mfa?next=%2Fcustomers%3Fstatus%3Dfailed');
    expect(gateRedirect('enroll', '/dashboard')).toBe('/account/security?setup=required&next=%2Fdashboard');
  });

  it('trusts only the server-written app_metadata claim for enrolment', () => {
    expect(enrolledFromClaims({ app_metadata: { mfa_enrolled: true } })).toBe(true);
    expect(enrolledFromClaims({ app_metadata: { mfa_enrolled: 'true' } })).toBe(false);
    expect(enrolledFromClaims({ user_metadata: { mfa_enrolled: true } })).toBe(false);
    expect(enrolledFromClaims(null)).toBe(false);
  });

  it('normalises typed codes and factor names', () => {
    expect(normaliseTotpCode('123 456')).toBe('123456');
    expect(normaliseTotpCode('12-34-56')).toBe('123456');
    expect(normaliseTotpCode('12345')).toBeNull();
    expect(normaliseTotpCode('abcdef')).toBeNull();
    expect(friendlyFactorName('Authenticator app', [])).toBe('Authenticator app');
    expect(friendlyFactorName('Authenticator app', ['Authenticator app'], new Date('2026-11-03T10:15:00Z'))).toBe('Authenticator app (2026-11-03 10:15)');
  });
});

describe('password policy', () => {
  it('applies one rule everywhere', () => {
    expect(checkPassword('short').ok).toBe(false);
    expect(checkPassword('password123')).toMatchObject({ ok: false });
    expect(checkPassword('aaaaaaaaaa')).toMatchObject({ ok: false });
    expect(checkPassword('x'.repeat(PASSWORD_MAX_LENGTH + 1))).toMatchObject({ ok: false });
    expect(checkPassword('sam.jones-salon', { email: 'sam.jones@salon.co.uk' })).toMatchObject({ ok: false });
    expect(checkPassword('blue kettle morning')).toEqual({ ok: true });
  });

  it('rates strength mainly on length', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('short')).toBe(1);
    expect(passwordStrength('greenpark')).toBe(2);
    expect(passwordStrength('greenparkway')).toBe(3);
    expect(passwordStrength('blue kettle morning walk')).toBe(4);
  });
});

describe('two-factor in the security posture', () => {
  const base = {
    members: [{ role: 'owner' as const }, { role: 'staff' as const }],
    pendingInvites: 0, expiredInvites: 0, apiKey: null, webhook: null, retentionDays: 365, hasContactEmail: true,
    googleStatus: null, auditEvents30d: 1,
  };

  it('warns when two-factor is optional and not everyone uses it', () => {
    const c = assessPosture({ ...base, mfa: { required: false, enrolled: 1, members: 2 } }).checks.find((x) => x.id === 'mfa');
    expect(c?.status).toBe('warn');
  });

  it('is fine once required and universal', () => {
    const c = assessPosture({ ...base, mfa: { required: true, enrolled: 2, members: 2 } }).checks.find((x) => x.id === 'mfa');
    expect(c?.status).toBe('ok');
  });
});

describe('team two-factor status and reset', () => {
  type User = { email: string; last_sign_in_at?: string; app_metadata?: Record<string, unknown>; factors?: Array<{ id: string; status: string; factor_type: string }> };

  function seed(users: Record<string, User>) {
    const db = new MiniDb() as MiniDb & { auth: unknown };
    const deleted: string[] = [];
    const updates: Array<{ id: string; app_metadata: Record<string, unknown> }> = [];
    db.auth = {
      admin: {
        getUserById: async (id: string) => ({ data: { user: users[id] ?? null } }),
        updateUserById: async (id: string, attrs: { app_metadata: Record<string, unknown> }) => {
          updates.push({ id, ...attrs });
          return { error: null };
        },
        mfa: {
          listFactors: async ({ userId }: { userId: string }) => ({ data: { factors: users[userId]?.factors ?? [] }, error: null }),
          deleteFactor: async ({ id }: { id: string }) => {
            deleted.push(id);
            return { error: null };
          },
        },
      },
    };
    db.rows('business_members').push(
      { id: 'm1', business_id: 'b1', user_id: 'owner', role: 'owner', created_at: '2026-01-01' },
      { id: 'm2', business_id: 'b1', user_id: 'admin', role: 'admin', created_at: '2026-01-02' },
      { id: 'm3', business_id: 'b1', user_id: 'staff', role: 'staff', created_at: '2026-01-03' }
    );
    return { db, deleted, updates };
  }

  const users: Record<string, User> = {
    owner: { email: 'o@x.co', last_sign_in_at: '2026-11-01T09:00:00Z', factors: [{ id: 'f1', status: 'verified', factor_type: 'totp' }] },
    admin: { email: 'a@x.co', app_metadata: { mfa_enrolled: true }, factors: [{ id: 'f2', status: 'verified', factor_type: 'totp' }] },
    staff: { email: 's@x.co', factors: [{ id: 'f3', status: 'unverified', factor_type: 'totp' }] },
  };

  it('reports two-factor status and last sign-in per member', async () => {
    const { db } = seed(users);
    const { members } = await listTeam(db as never, 'b1');
    expect(members.map((m) => [m.userId, m.mfaEnrolled, m.lastSignInAt])).toEqual([
      ['owner', true, '2026-11-01T09:00:00Z'],
      ['admin', true, null],
      ['staff', false, null],
    ]);
  });

  it('lets the owner reset an admin, removing every factor and the flag', async () => {
    const { db, deleted, updates } = seed(users);
    const r = await resetMemberMfa(db as never, { businessId: 'b1', targetUserId: 'admin', actorId: 'owner', actorRole: 'owner' });
    expect(r).toEqual({ ok: true, removed: 1 });
    expect(deleted).toEqual(['f2']);
    expect(updates).toEqual([{ id: 'admin', app_metadata: { mfa_enrolled: false } }]);
  });

  it('follows the role rules: admins cannot reset admins or owners, nobody resets themselves', async () => {
    const { db } = seed(users);
    expect(await resetMemberMfa(db as never, { businessId: 'b1', targetUserId: 'owner', actorId: 'admin', actorRole: 'admin' })).toMatchObject({ ok: false });
    expect(await resetMemberMfa(db as never, { businessId: 'b1', targetUserId: 'admin', actorId: 'admin', actorRole: 'admin' })).toMatchObject({ ok: false });
    expect(await resetMemberMfa(db as never, { businessId: 'b1', targetUserId: 'staff', actorId: 'admin', actorRole: 'admin' })).toMatchObject({ ok: true });
    expect(await resetMemberMfa(db as never, { businessId: 'b2', targetUserId: 'staff', actorId: 'owner', actorRole: 'owner' })).toMatchObject({ ok: false });
  });
});
