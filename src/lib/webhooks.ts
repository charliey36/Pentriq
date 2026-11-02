import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import { decryptToken, isTokenEncryptionConfigured } from '@/lib/google-token-crypto';
import { logEvent } from '@/lib/log';

/**
 * Outbound webhooks: Pentriq POSTs signed JSON to a URL the business controls whenever something happens
 * (a customer is added, private feedback arrives), so Zapier/Make/n8n or their own systems can react.
 *
 * Security properties (each covered by tests):
 *  - HTTPS only, no embedded credentials, no localhost / private / link-local / cloud-metadata targets (SSRF),
 *    checked on the literal host AND on every address the hostname resolves to at send time.
 *  - Redirects are never followed (a public URL cannot bounce the request to an internal one).
 *  - Payloads are signed `HMAC-SHA256(secret, "<timestamp>.<body>")`; the timestamp is inside the signed string so
 *    receivers can reject replays. The secret is encrypted at rest and shown once.
 *  - Delivery is best effort with a hard timeout and NEVER throws into the calling user action.
 *  - After MAX_FAILURES consecutive failures the endpoint is switched off, so a dead URL cannot slow every action.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from(table: string): any };

export const WEBHOOK_EVENTS = ['customer.created', 'feedback.received', 'feedback.resolved', 'visit.logged'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | 'webhook.test';
export const MAX_FAILURES = 10;
export const DELIVERY_TIMEOUT_MS = 3000;

export type Lookup = (hostname: string) => Promise<{ address: string }[]>;
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: 'manual'; signal: AbortSignal }) => Promise<{ status: number }>;

export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
  }
  if (v === 6) {
    const x = address.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('::ffff:')) return isPrivateAddress(x.slice(7)); // IPv4-mapped
    return x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb');
  }
  return true; // not an IP at all: treat as unsafe
}

/** Syntactic check done when the URL is saved. */
export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Enter a full URL starting with https://' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'The URL must start with https://' };
  if (u.username || u.password) return { ok: false, error: 'Remove the username/password from the URL.' };
  if (raw.length > 2048) return { ok: false, error: 'That URL is too long.' };
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !isIP(host)) {
    return { ok: false, error: 'That address is not reachable from the internet.' };
  }
  if (isIP(host) && isPrivateAddress(host)) return { ok: false, error: 'That address is not reachable from the internet.' };
  return { ok: true, url: u.toString() };
}

/** Send-time check: every address the hostname resolves to must be public (blocks DNS pointing at internal hosts). */
export async function assertPublicTarget(url: string, lookup: Lookup = (h) => dnsLookup(h, { all: true })): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host);
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new Error('blocked_target');
}

export function newSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function sign(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** For receivers (and our tests): verifies a `Pentriq-Signature: t=...,v1=...` header, rejecting stale timestamps. */
export function verifySignature(secret: string, header: string, body: string, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = Buffer.from(sign(secret, t, body));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type EndpointRow = { id: string; business_id: string; url: string; secret_encrypted: string; events: string[]; is_active: boolean; consecutive_failures: number };

/** Transient outcomes worth one more try: timeouts, connection failures, 429 and 5xx. Redirects and 4xx are final. */
export function isRetryable(result: { status?: number; error?: string }): boolean {
  if (result.error === 'timeout' || result.error === 'network_error') return true;
  return typeof result.status === 'number' && (result.status === 429 || result.status >= 500);
}

export type DeliverDeps = {
  fetchImpl?: FetchLike;
  lookup?: Lookup;
  now?: () => number;
  /** Extra attempts after a transient failure (default 0). The same delivery id is reused so receivers can de-duplicate. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const RETRY_DELAYS_MS = [400, 1500];

/** Sends one event to one endpoint and records the outcome (one log row, however many attempts). Never throws. */
export async function deliver(
  db: Db,
  endpoint: EndpointRow,
  type: WebhookEvent,
  data: Record<string, unknown>,
  deps: DeliverDeps = {}
): Promise<{ ok: boolean; status?: number; error?: string; attempts: number }> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();
  const id = randomUUID();
  let status: number | undefined;
  let error: string | undefined;
  let attempts = 0;
  const maxAttempts = 1 + Math.max(0, Math.min(2, deps.retries ?? 0));

  while (attempts < maxAttempts) {
    attempts += 1;
    status = undefined;
    error = undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      await assertPublicTarget(endpoint.url, deps.lookup);
      const body = JSON.stringify({ id, type, created_at: new Date(started).toISOString(), data });
      const ts = Math.floor(now() / 1000);
      const secret = decryptToken(endpoint.secret_encrypted);
      const res = await (deps.fetchImpl ?? (fetch as unknown as FetchLike))(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Pentriq-Webhooks/1',
          'pentriq-event': type,
          'pentriq-delivery': id,
          'pentriq-attempt': String(attempts),
          'pentriq-signature': `t=${ts},v1=${sign(secret, ts, body)}`,
        },
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
      status = res.status;
      if (status < 200 || status >= 300) error = `HTTP ${status}`;
    } catch (e) {
      error = controller.signal.aborted ? 'timeout' : e instanceof Error && e.message === 'blocked_target' ? 'blocked_target' : 'network_error';
    } finally {
      clearTimeout(timer);
    }
    if (!error || !isRetryable({ status, error }) || attempts >= maxAttempts) break;
    await sleep(RETRY_DELAYS_MS[attempts - 1] ?? 1500);
  }
  if (error && attempts > 1) error = `${error} after ${attempts} attempts`;

  const ok = !error;
  try {
    await db.from('webhook_deliveries').insert({
      business_id: endpoint.business_id, endpoint_id: endpoint.id, event_type: type,
      status: ok ? 'succeeded' : 'failed', http_status: status ?? null, error: error ?? null, duration_ms: now() - started,
    });
    if (ok) {
      await db.from('webhook_endpoints').update({ consecutive_failures: 0, last_success_at: new Date(now()).toISOString() }).eq('id', endpoint.id);
    } else {
      const failures = endpoint.consecutive_failures + 1;
      await db.from('webhook_endpoints').update(
        failures >= MAX_FAILURES
          ? { consecutive_failures: failures, is_active: false, disabled_reason: `Switched off after ${MAX_FAILURES} failed deliveries in a row (last: ${error}).` }
          : { consecutive_failures: failures }
      ).eq('id', endpoint.id);
    }
  } catch (e) {
    logEvent('db', 'webhook_log_failed', { reason: e instanceof Error ? e.message : String(e) }, 'error');
  }
  return { ok, status, error, attempts };
}

/** Fire-and-forget from user actions: finds the business's endpoint, and delivers if it is on and subscribed. Never throws. */
export async function emitWebhookEvent(db: Db, businessId: string, type: Exclude<WebhookEvent, 'webhook.test'>, data: Record<string, unknown>, deps?: DeliverDeps): Promise<void> {
  try {
    if (!isTokenEncryptionConfigured()) return;
    const { data: endpoint } = await db.from('webhook_endpoints').select('id, business_id, url, secret_encrypted, events, is_active, consecutive_failures').eq('business_id', businessId).eq('is_active', true).maybeSingle();
    if (!endpoint || !(endpoint.events as string[]).includes(type)) return;
    // One quick retry for transient failures; the caller is a user action, so keep the wait short.
    await deliver(db, endpoint as EndpointRow, type, data, { retries: 1, ...deps });
  } catch (e) {
    logEvent('db', 'webhook_emit_failed', { reason: e instanceof Error ? e.message : String(e) }, 'error');
  }
}

