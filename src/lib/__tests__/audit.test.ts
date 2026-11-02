/** @jest-environment node */
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }));
import { recordAudit, hashIp } from '../audit';

describe('recordAudit', () => {
  it('writes the entry with a hashed IP, never the raw address', async () => {
    const insert = jest.fn(async () => ({ error: null }));
    await recordAudit({ action: 'api_key.regenerated', businessId: 'b1', actorId: 'u1', ip: '203.0.113.9' }, { from: () => ({ insert }) });
    const row = (insert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(row).toMatchObject({ action: 'api_key.regenerated', business_id: 'b1', actor_id: 'u1' });
    expect(row.ip_hash).toBe(hashIp('203.0.113.9'));
    expect(JSON.stringify(row)).not.toContain('203.0.113.9');
  });
  it('never throws when the database errors or throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(recordAudit({ action: 'account.exported' }, { from: () => ({ insert: async () => ({ error: { message: 'boom' } }) }) })).resolves.toBeUndefined();
    await expect(recordAudit({ action: 'account.exported' }, { from: () => { throw new Error('down'); } })).resolves.toBeUndefined();
  });
});
