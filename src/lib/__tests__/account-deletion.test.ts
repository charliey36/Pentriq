import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const signInWithPassword = jest.fn() as jest.MockedFunction<
  (args: { email: string; password: string }) => Promise<unknown>
>;
const signOut = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const deleteUser = jest.fn() as jest.MockedFunction<(userId: string) => Promise<unknown>>;
const redirect = jest.fn();
const adminFrom = jest.fn() as jest.MockedFunction<(table: string) => unknown>;
const storageRemove = jest.fn() as jest.MockedFunction<(paths: string[]) => Promise<unknown>>;

jest.mock('next/navigation', () => ({ redirect }));
jest.mock('@/lib/business', () => ({
  requireBusiness: jest.fn(async () => ({
    id: 'business-1',
    owner_id: 'user-1',
    stripe_subscription_id: null,
  })),
  getAuthUser: jest.fn(async () => ({ id: 'user-1', email: 'owner@example.com' })),
}));
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { signInWithPassword, signOut } }),
}));
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { deleteUser } },
    storage: { from: () => ({ remove: storageRemove }) },
    from: adminFrom,
  }),
}));
jest.mock('@/lib/stripe', () => ({ getStripe: jest.fn() }));
jest.mock('@/lib/billing', () => ({ stripeConfigured: jest.fn(() => false) }));
jest.mock('@/lib/google-token-crypto', () => ({ decryptToken: jest.fn() }));
jest.mock('@/lib/google-business', () => ({ revokeToken: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deleteAccount } = require('../../app/(app)/settings/privacy/actions') as typeof import('../../app/(app)/settings/privacy/actions');

function form(values: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set('confirm', 'DELETE');
  fd.set('password', 'correct horse battery staple');
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

describe('deleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signInWithPassword.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValue({ error: null });
    storageRemove.mockResolvedValue({ error: null });
    adminFrom.mockImplementation((table: string) => {
      if (table === 'google_business_connections') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      return { delete: () => ({ eq: async () => ({ error: null }) }) };
    });
  });

  it('requires the current password before deleting anything', async () => {
    const result = await deleteAccount({}, form({ password: '' }));
    expect(result.error).toMatch(/current password/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('reauthenticates, deletes the auth user, and signs out the session', async () => {
    await deleteAccount({}, form());
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    });
    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(storageRemove).toHaveBeenCalledWith([
      'business-1/logo.png',
      'business-1/logo.jpg',
      'business-1/logo.webp',
    ]);
    expect(signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith('/?account=deleted');
  });

  it('does not delete when password verification fails', async () => {
    signInWithPassword.mockResolvedValue({ error: new Error('invalid credentials') });
    const result = await deleteAccount({}, form());
    expect(result.error).toMatch(/password could not be verified/i);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
  });
});
