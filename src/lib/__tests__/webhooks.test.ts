import { MiniDb } from './helpers/mini-db';
import { encryptToken, decryptToken } from '@/lib/google-token-crypto';
import {
  assertPublicTarget, deliver, emitWebhookEvent, isPrivateAddress, MAX_FAILURES, newSecret, sign, validateWebhookUrl, verifySignature,
  type EndpointRow, type FetchLike,
} from '@/lib/webhooks';

const KEY = Buffer.alloc(32, 7).toString('base64');
beforeAll(() => { process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = KEY; });

const publicLookup = async () => [{ address: '93.184.216.34' }];

function setup(failures = 0) {
  const db = new MiniDb();
  const secret = newSecret();
  const endpoint: EndpointRow = { id: 'ep1', business_id: 'biz1', url: 'https://hooks.example.com/in', secret_encrypted: encryptToken(secret), events: ['customer.created'], is_active: true, consecutive_failures: failures };
  db.rows('webhook_endpoints').push({ ...endpoint });
  return { db, secret, endpoint };
}

describe('webhook URL validation (SSRF)', () => {
  it.each([
    'http://example.com/x', 'ftp://example.com', 'https://user:pw@example.com', 'https://localhost/x', 'https://app.localhost/x',
    'https://intranet/x', 'https://printer.local/x', 'https://svc.internal/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x',
    'https://192.168.1.1/x', 'https://172.16.0.1/x', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/x', 'https://[fd00::1]/x',
    'https://[::ffff:127.0.0.1]/x', 'not a url', '',
  ])('rejects %s', (u) => expect(validateWebhookUrl(u).ok).toBe(false));

  it('accepts a normal public https URL', () => {
    expect(validateWebhookUrl('https://hooks.zapier.com/hooks/catch/1/abc/')).toEqual({ ok: true, url: 'https://hooks.zapier.com/hooks/catch/1/abc/' });
  });

  it('classifies private ranges', () => {
    for (const a of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.1.1', '172.31.255.255', '192.168.0.1', '224.0.0.1']) expect(isPrivateAddress(a)).toBe(true);
    for (const a of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '1.1.1.1']) expect(isPrivateAddress(a)).toBe(false);
  });

  it('blocks a public-looking hostname that resolves to an internal address (DNS rebinding)', async () => {
    await expect(assertPublicTarget('https://evil.example.com/x', async () => [{ address: '127.0.0.1' }])).rejects.toThrow('blocked_target');
    await expect(assertPublicTarget('https://evil.example.com/x', async () => [{ address: '8.8.8.8' }, { address: '10.0.0.1' }])).rejects.toThrow();
    await expect(assertPublicTarget('https://ok.example.com/x', publicLookup)).resolves.toBeUndefined();
  });
});

describe('signatures', () => {
  it('verifies a valid signature and rejects tampering, wrong secret and stale timestamps', () => {
    const body = '{"a":1}';
    const header = `t=1000,v1=${sign('s3cret', 1000, body)}`;
    expect(verifySignature('s3cret', header, body, 300, 1100)).toBe(true);
    expect(verifySignature('s3cret', header, '{"a":2}', 300, 1100)).toBe(false);
    expect(verifySignature('other', header, body, 300, 1100)).toBe(false);
    expect(verifySignature('s3cret', header, body, 300, 5000)).toBe(false);
    expect(verifySignature('s3cret', 'garbage', body)).toBe(false);
  });

  it('secrets are encrypted at rest and round-trip', () => {
    const s = newSecret();
    const enc = encryptToken(s);
    expect(enc).not.toContain(s);
    expect(decryptToken(enc)).toBe(s);
  });
});

describe('delivery', () => {
  it('posts signed JSON without following redirects and logs success', async () => {
    const { db, secret, endpoint } = setup(3);
    let seen: Parameters<FetchLike> | undefined;
    const fetchImpl: FetchLike = async (...args) => { seen = args; return { status: 200 }; };
    const res = await deliver(db, endpoint, 'customer.created', { name: 'Ann' }, { fetchImpl, lookup: publicLookup });
    expect(res.ok).toBe(true);
    const [, init] = seen!;
    expect(init.redirect).toBe('manual');
    expect(init.headers['pentriq-event']).toBe('customer.created');
    expect(verifySignature(secret, init.headers['pentriq-signature'], init.body)).toBe(true);
    expect(JSON.parse(init.body).data).toEqual({ name: 'Ann' });
    expect(db.rows('webhook_deliveries')[0]).toMatchObject({ status: 'succeeded', http_status: 200 });
    expect(db.rows('webhook_endpoints')[0].consecutive_failures).toBe(0);
  });

  it('treats a redirect or server error as failure and counts it', async () => {
    const { db, endpoint } = setup();
    const res = await deliver(db, endpoint, 'customer.created', {}, { fetchImpl: async () => ({ status: 302 }), lookup: publicLookup });
    expect(res).toMatchObject({ ok: false, error: 'HTTP 302' });
    expect(db.rows('webhook_endpoints')[0].consecutive_failures).toBe(1);
  });

  it('never sends when the host resolves internally', async () => {
    const { db, endpoint } = setup();
    const fetchImpl = jest.fn();
    const res = await deliver(db, endpoint, 'customer.created', {}, { fetchImpl: fetchImpl as never, lookup: async () => [{ address: '169.254.169.254' }] });
    expect(res).toMatchObject({ ok: false, error: 'blocked_target' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('switches the endpoint off after repeated failures', async () => {
    const { db, endpoint } = setup(MAX_FAILURES - 1);
    await deliver(db, endpoint, 'customer.created', {}, { fetchImpl: async () => { throw new Error('boom'); }, lookup: publicLookup });
    expect(db.rows('webhook_endpoints')[0]).toMatchObject({ is_active: false, consecutive_failures: MAX_FAILURES });
    expect(db.rows('webhook_endpoints')[0].disabled_reason).toContain('Switched off');
  });

  it('never throws into the caller, even if the log write fails', async () => {
    const { endpoint } = setup();
    const brokenDb = { from() { throw new Error('db down'); } };
    await expect(deliver(brokenDb, endpoint, 'customer.created', {}, { fetchImpl: async () => ({ status: 200 }), lookup: publicLookup })).resolves.toMatchObject({ ok: true });
  });
});

describe('emitWebhookEvent', () => {
  it('only fires for subscribed events on active endpoints, and never throws', async () => {
    const { db } = setup();
    const fetchImpl = jest.fn(async () => ({ status: 200 }));
    await emitWebhookEvent(db, 'biz1', 'feedback.received', {}, { fetchImpl: fetchImpl as never, lookup: publicLookup });
    expect(fetchImpl).not.toHaveBeenCalled(); // endpoint subscribes to customer.created only
    await emitWebhookEvent(db, 'biz1', 'customer.created', {}, { fetchImpl: fetchImpl as never, lookup: publicLookup });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(emitWebhookEvent({ from() { throw new Error('x'); } }, 'biz1', 'customer.created', {})).resolves.toBeUndefined();
  });

  it('is a no-op for a business with no endpoint', async () => {
    const fetchImpl = jest.fn();
    await emitWebhookEvent(new MiniDb(), 'nobody', 'customer.created', {}, { fetchImpl: fetchImpl as never });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('delivery retries', () => {
  const noSleep = async () => undefined;

  it('retries a transient failure and logs a single delivery', async () => {
    const { db, endpoint } = setup();
    const statuses = [503, 200];
    const seenAttempts: string[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      seenAttempts.push(init.headers['pentriq-attempt']);
      return { status: statuses.shift() ?? 200 };
    };
    const res = await deliver(db, endpoint, 'customer.created', {}, { fetchImpl, lookup: publicLookup, retries: 2, sleep: noSleep });
    expect(res).toMatchObject({ ok: true, attempts: 2 });
    expect(seenAttempts).toEqual(['1', '2']);
    expect(db.rows('webhook_deliveries')).toHaveLength(1);
    expect(db.rows('webhook_endpoints')[0].consecutive_failures).toBe(0);
  });

  it('does not retry permanent failures such as 4xx or redirects', async () => {
    const { db, endpoint } = setup();
    const fetchImpl = jest.fn(async () => ({ status: 400 }));
    const res = await deliver(db, endpoint, 'customer.created', {}, { fetchImpl: fetchImpl as never, lookup: publicLookup, retries: 2, sleep: noSleep });
    expect(res).toMatchObject({ ok: false, error: 'HTTP 400', attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget and counts one failure', async () => {
    const { db, endpoint } = setup();
    const fetchImpl = jest.fn(async () => { throw new Error('reset'); });
    const res = await deliver(db, endpoint, 'customer.created', {}, { fetchImpl: fetchImpl as never, lookup: publicLookup, retries: 2, sleep: noSleep });
    expect(res).toMatchObject({ ok: false, error: 'network_error after 3 attempts', attempts: 3 });
    expect(db.rows('webhook_endpoints')[0].consecutive_failures).toBe(1);
  });

  it('caps the retry budget at two extra attempts', async () => {
    const { db, endpoint } = setup();
    const fetchImpl = jest.fn(async () => ({ status: 500 }));
    await deliver(db, endpoint, 'customer.created', {}, { fetchImpl: fetchImpl as never, lookup: publicLookup, retries: 10, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
