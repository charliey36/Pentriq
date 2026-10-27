/**
 * Booking-system connectors. Each provider turns "appointments that have
 * happened" into rows shaped exactly like a CSV import row, so everything after
 * that (customer matching, duplicate skipping, opt-outs, frequency limit,
 * review scheduling) is the same proven code path as the CSV import.
 */
import type { BulkImportRow } from '@/lib/customers';

export type ProviderId = 'square' | 'acuity' | 'calendly';

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  /** ISO time the access token stops working; null = does not expire. */
  expiresAt?: string | null;
  /** Human label for the connected account, shown in Settings. */
  accountLabel?: string | null;
};

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Raised when the provider rejects our credentials, so the owner is asked to reconnect. */
export class ReconnectRequired extends Error {}

export type FetchWindow = { from: Date; to: Date };

export interface BookingProvider {
  id: ProviderId;
  label: string;
  /** What the owner needs to know before connecting. */
  blurb: string;
  isConfigured(): boolean;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string, f?: FetchLike): Promise<TokenSet>;
  /** Present only for providers whose tokens expire. */
  refresh?(tokens: { refreshToken: string }, f?: FetchLike): Promise<TokenSet>;
  /** Appointments that have already finished inside the window, as import rows. */
  fetchCompleted(accessToken: string, window: FetchWindow, f?: FetchLike): Promise<FetchResult>;
}

export type FetchResult = {
  rows: BulkImportRow[];
  /** Completed appointments we could not use (e.g. customer has no email address). */
  skippedNoEmail: number;
};

export const DAY_MS = 86_400_000;

export function splitName(full: string): string {
  return full.replace(/\s+/g, ' ').trim();
}

export function joinName(first?: string | null, last?: string | null): string {
  return [first, last].map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
}

/** YYYY-MM-DD of an instant in UTC (provider timestamps carry their own offsets). */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function getJson<T>(f: FetchLike, url: string, init: RequestInit, provider: string): Promise<T> {
  const res = await f(url, init);
  if (res.status === 401 || res.status === 403) throw new ReconnectRequired(`${provider} rejected our access (${res.status}).`);
  if (!res.ok) throw new Error(`${provider} request failed (${res.status}).`);
  return (await res.json()) as T;
}
