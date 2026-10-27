import { DAY_MS, ReconnectRequired, getJson, isoDate, joinName, type BookingProvider, type FetchLike, type FetchResult, type TokenSet } from './types';

const AUTH = 'https://acuityscheduling.com/oauth2';
const API = 'https://acuityscheduling.com/api/v1';
const WINDOW_DAYS = 7;
const MAX = 500;

type Appointment = {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  datetime?: string;
  duration?: string | number;
  type?: string;
  calendar?: string;
  price?: string | number;
  canceled?: boolean;
  noShow?: boolean;
};

/** Finished = not cancelled, not a no-show, and the end time has passed. */
export function isFinishedAppointment(a: Appointment, now = new Date()): boolean {
  if (a.canceled || a.noShow || !a.datetime) return false;
  const start = Date.parse(a.datetime);
  if (Number.isNaN(start)) return false;
  return start + Number(a.duration ?? 0) * 60_000 <= now.getTime();
}

async function tokenRequest(code: string, redirectUri: string, f: FetchLike): Promise<TokenSet> {
  const res = await f(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: process.env.ACUITY_CLIENT_ID ?? '', client_secret: process.env.ACUITY_CLIENT_SECRET ?? '' }),
  });
  if (!res.ok) throw new ReconnectRequired(`Acuity token request failed (${res.status}).`);
  const j = (await res.json()) as { access_token: string };
  // Acuity access tokens do not expire; a revoked token surfaces as a 401 on the next sync.
  return { accessToken: j.access_token, refreshToken: null, expiresAt: null, accountLabel: 'Acuity Scheduling' };
}

export const acuity: BookingProvider = {
  id: 'acuity',
  label: 'Acuity Scheduling',
  blurb: 'Pulls finished appointments, with client, appointment type and calendar.',
  isConfigured: () => Boolean(process.env.ACUITY_CLIENT_ID && process.env.ACUITY_CLIENT_SECRET),
  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({ response_type: 'code', scope: 'api-v1', client_id: process.env.ACUITY_CLIENT_ID ?? '', redirect_uri: redirectUri, state });
    return `${AUTH}/authorize?${q}`;
  },
  exchangeCode: (code, redirectUri, f = fetch) => tokenRequest(code, redirectUri, f),

  async fetchCompleted(accessToken, { from, to }, f = fetch): Promise<FetchResult> {
    const now = new Date();
    const seen = new Set<number>();
    const rows: FetchResult['rows'] = [];
    let skippedNoEmail = 0;
    for (let start = from.getTime(); start <= to.getTime(); start += WINDOW_DAYS * DAY_MS) {
      const end = Math.min(start + (WINDOW_DAYS - 1) * DAY_MS, to.getTime());
      const q = new URLSearchParams({ minDate: isoDate(new Date(start)), maxDate: isoDate(new Date(end)), canceled: 'false', max: String(MAX), direction: 'ASC' });
      const list = await getJson<Appointment[]>(f, `${API}/appointments?${q}`, { headers: { Authorization: `Bearer ${accessToken}` } }, 'Acuity');
      for (const a of list) {
        if (seen.has(a.id) || !isFinishedAppointment(a, now)) continue;
        seen.add(a.id);
        const email = (a.email ?? '').trim();
        if (!email) { skippedNoEmail += 1; continue; }
        const price = a.price === undefined || a.price === '' ? null : String(a.price);
        rows.push({
          name: joinName(a.firstName, a.lastName) || email.split('@')[0],
          email,
          phone: a.phone?.trim() || null,
          service: a.type?.trim() || 'Appointment',
          date: isoDate(new Date(a.datetime!)),
          amountSpent: price && Number(price) > 0 ? price : null,
          ...(a.calendar?.trim() ? { staff: a.calendar.trim() } : {}),
        });
      }
    }
    return { rows, skippedNoEmail };
  },
};
