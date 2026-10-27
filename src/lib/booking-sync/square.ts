import { DAY_MS, ReconnectRequired, getJson, isoDate, joinName, type BookingProvider, type FetchLike, type FetchResult, type TokenSet } from './types';

const base = () => (process.env.SQUARE_ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com');
const SCOPES = ['APPOINTMENTS_READ', 'APPOINTMENTS_ALL_READ', 'CUSTOMERS_READ', 'ITEMS_READ', 'EMPLOYEES_READ'];
const MAX_RANGE_DAYS = 31; // ListBookings rejects a start-time range longer than 31 days

type Booking = {
  id: string;
  status: string;
  start_at: string;
  customer_id?: string;
  appointment_segments?: Array<{ service_variation_id?: string; team_member_id?: string; duration_minutes?: number }>;
};

/** Square has no "completed" status: an ACCEPTED booking whose end time has passed is a finished appointment. */
export function isFinishedBooking(b: Booking, now = new Date()): boolean {
  if (b.status !== 'ACCEPTED') return false;
  const start = Date.parse(b.start_at);
  if (Number.isNaN(start)) return false;
  const minutes = (b.appointment_segments ?? []).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  return start + minutes * 60_000 <= now.getTime();
}

function tokenSet(j: { access_token: string; refresh_token?: string; expires_at?: string; merchant_id?: string }): TokenSet {
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresAt: j.expires_at ?? null, accountLabel: j.merchant_id ? `Square merchant ${j.merchant_id}` : 'Square' };
}

async function tokenRequest(body: Record<string, string>, f: FetchLike): Promise<TokenSet> {
  const res = await f(`${base()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-10-17' },
    body: JSON.stringify({ client_id: process.env.SQUARE_CLIENT_ID, client_secret: process.env.SQUARE_CLIENT_SECRET, ...body }),
  });
  if (!res.ok) throw new ReconnectRequired(`Square token request failed (${res.status}).`);
  return tokenSet(await res.json());
}

export const square: BookingProvider = {
  id: 'square',
  label: 'Square Appointments',
  blurb: 'Pulls finished appointments, with customer, service and team member.',
  isConfigured: () => Boolean(process.env.SQUARE_CLIENT_ID && process.env.SQUARE_CLIENT_SECRET),
  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({ client_id: process.env.SQUARE_CLIENT_ID ?? '', scope: SCOPES.join(' '), session: 'false', state, redirect_uri: redirectUri });
    return `${base()}/oauth2/authorize?${q}`;
  },
  exchangeCode: (code, redirectUri, f = fetch) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }, f),
  refresh: ({ refreshToken }, f = fetch) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, f),

  async fetchCompleted(accessToken, { from, to }, f = fetch): Promise<FetchResult> {
    const headers = { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-10-17', 'Content-Type': 'application/json' };
    const get = <T,>(path: string) => getJson<T>(f, `${base()}${path}`, { headers }, 'Square');
    const post = <T,>(path: string, body: unknown) => getJson<T>(f, `${base()}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }, 'Square');
    const now = new Date();

    // 1. Bookings, in <=31 day windows, following the cursor.
    const bookings: Booking[] = [];
    for (let start = from.getTime(); start < to.getTime(); start += MAX_RANGE_DAYS * DAY_MS) {
      const end = Math.min(start + MAX_RANGE_DAYS * DAY_MS, to.getTime());
      let cursor: string | undefined;
      do {
        const q = new URLSearchParams({ start_at_min: new Date(start).toISOString(), start_at_max: new Date(end).toISOString(), limit: '200' });
        if (cursor) q.set('cursor', cursor);
        const page = await get<{ bookings?: Booking[]; cursor?: string }>(`/v2/bookings?${q}`);
        bookings.push(...(page.bookings ?? []).filter((b) => isFinishedBooking(b, now)));
        cursor = page.cursor;
      } while (cursor);
    }
    if (bookings.length === 0) return { rows: [], skippedNoEmail: 0 };

    // 2. Look up each distinct customer, service and team member once.
    const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter((x): x is string => Boolean(x)))];
    const customers = new Map<string, { name: string; email: string; phone: string | null }>();
    for (const id of customerIds) {
      const { customer } = await get<{ customer?: { given_name?: string; family_name?: string; email_address?: string; phone_number?: string } }>(`/v2/customers/${id}`);
      if (customer) customers.set(id, { name: joinName(customer.given_name, customer.family_name), email: customer.email_address ?? '', phone: customer.phone_number ?? null });
    }

    const variationIds = [...new Set(bookings.flatMap((b) => (b.appointment_segments ?? []).map((s) => s.service_variation_id)).filter((x): x is string => Boolean(x)))];
    const services = new Map<string, string>();
    if (variationIds.length) {
      const cat = await post<{ objects?: Array<{ id: string; item_variation_data?: { name?: string; item_id?: string } }>; related_objects?: Array<{ id: string; item_data?: { name?: string } }> }>(
        '/v2/catalog/batch-retrieve',
        { object_ids: variationIds, include_related_objects: true }
      );
      const itemNames = new Map((cat.related_objects ?? []).map((o) => [o.id, o.item_data?.name ?? '']));
      for (const o of cat.objects ?? []) {
        const item = itemNames.get(o.item_variation_data?.item_id ?? '') ?? '';
        const variation = o.item_variation_data?.name ?? '';
        services.set(o.id, item && variation && item !== variation && variation !== 'Regular' ? `${item} - ${variation}` : item || variation);
      }
    }

    const staffIds = [...new Set(bookings.flatMap((b) => (b.appointment_segments ?? []).map((s) => s.team_member_id)).filter((x): x is string => Boolean(x)))];
    const staff = new Map<string, string>();
    for (const id of staffIds) {
      try {
        const { team_member } = await get<{ team_member?: { given_name?: string; family_name?: string } }>(`/v2/team-members/${id}`);
        if (team_member) staff.set(id, joinName(team_member.given_name, team_member.family_name));
      } catch (e) {
        if (e instanceof ReconnectRequired) continue; // staff names are optional: a missing EMPLOYEES scope must not stop the sync
        throw e;
      }
    }

    // 3. Shape rows like CSV import rows.
    const rows: FetchResult['rows'] = [];
    let skippedNoEmail = 0;
    for (const b of bookings) {
      const c = b.customer_id ? customers.get(b.customer_id) : undefined;
      if (!c || !c.email) { skippedNoEmail += 1; continue; }
      const seg = b.appointment_segments?.[0];
      rows.push({
        name: c.name || c.email.split('@')[0],
        email: c.email,
        phone: c.phone,
        service: (seg?.service_variation_id && services.get(seg.service_variation_id)) || 'Appointment',
        date: isoDate(new Date(b.start_at)),
        amountSpent: null,
        ...(seg?.team_member_id && staff.get(seg.team_member_id) ? { staff: staff.get(seg.team_member_id)! } : {}),
      });
    }
    return { rows, skippedNoEmail };
  },
};
