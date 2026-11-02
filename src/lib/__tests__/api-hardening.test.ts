/** @jest-environment node */
import { NextRequest } from 'next/server';

const mockWithinLimit = jest.fn();
const mockResolve = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  RATE_LIMITS: { apiIp: { limit: 120, windowSeconds: 60 } },
  requesterId: () => '1.2.3.4',
  withinLimit: (...a: unknown[]) => mockWithinLimit(...a),
}));
jest.mock('@/lib/api-keys', () => ({ resolveBusinessByApiKey: (...a: unknown[]) => mockResolve(...a) }));
jest.mock('@/lib/service-import', () => ({ handleServiceCompleted: jest.fn(async () => ({ status: 200, body: { success: true } })) }));

import { POST } from '@/app/api/integrations/service-completed/route';

const req = () => new NextRequest('http://localhost/api/integrations/service-completed', { method: 'POST', headers: { 'x-api-key': 'k' }, body: '{}' });

describe('service-completed API hardening', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 429 with Retry-After before touching the key table when over the limit', async () => {
    mockWithinLimit.mockResolvedValue(false);
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('still rejects an unknown key with 401 when within the limit', async () => {
    mockWithinLimit.mockResolvedValue(true);
    mockResolve.mockResolvedValue(null);
    expect((await POST(req())).status).toBe(401);
  });
});
