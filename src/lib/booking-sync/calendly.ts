import { ReconnectRequired, getJson, isoDate, splitName, type BookingProvider, type FetchLike, type FetchResult, type TokenSet } from './types';

const AUTH = 'https://auth.calendly.com/oauth';
const API = 'https://api.calendly.com';
const MAX_EVENTS = 300; // keeps one sync well inside the request time limit

type Event = { uri: string; name?: string; start_time: string; end_time: string; status: string; event_memberships?: Array<{ user_name?: string }> };
type Invitee = { name?: string; first_name?: string; last_name?: string; email?: string; status?: string; text_reminder_number?: string | null };

async function tokenRequest(body: Record<string, string>, f: FetchLike): Promise<TokenSet & { owner?: string }> {
  const res = await f(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.CALENDLY_CLIENT_ID ?? '', client_secret: process.env.CALENDLY_CLIENT_SECRET ?? '', ...body }),
  });
  if (!res.ok) throw new ReconnectRequired(`Calendly token request failed (${res.status}).`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; owner?: string };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null,
    accountLabel: 'Calendly',
    owner: j.owner,
  };
}

export const calendly: BookingProvider = {
  id: 'calendly',
  label: 'Calendly',
  blurb: 'Pulls finished meetings and their invitees. Best for consultations and appointments booked through Calendly.',
  isConfigured: () => Boolean(process.env.CALENDLY_CLIENT_ID && process.env.CALENDLY_CLIENT_SECRET),
  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({ client_id: process.env.CALENDLY_CLIENT_ID ?? '', response_type: 'code', redirect_uri: redirectUri, state });
    return `${AUTH}/authorize?${q}`;
  },
  exchangeCode: (code, redirectUri, f = fetch) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }, f),
  refresh: ({ refreshToken }, f = fetch) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, f),

  async fetchCompleted(accessToken, { from, to }, f = fetch): Promise<FetchResult> {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const get = <T,>(url: string) => getJson<T>(f, url, { headers }, 'Calendly');
    const now = new Date();

    const me = await get<{ resource: { uri: string } }>(`${API}/users/me`);
    const events: Event[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ user: me.resource.uri, status: 'active', min_start_time: from.toISOString(), max_start_time: to.toISOString(), count: '100', sort: 'start_time:asc' });
      if (pageToken) q.set('page_token', pageToken);
      const page = await get<{ collection: Event[]; pagination?: { next_page_token?: string | null } }>(`${API}/scheduled_events?${q}`);
      events.push(...page.collection.filter((e) => Date.parse(e.end_time) <= now.getTime()));
      pageToken = page.pagination?.next_page_token ?? undefined;
    } while (pageToken && events.length < MAX_EVENTS);

    const rows: FetchResult['rows'] = [];
    let skippedNoEmail = 0;
    for (const e of events.slice(0, MAX_EVENTS)) {
      const { collection } = await get<{ collection: Invitee[] }>(`${e.uri}/invitees?status=active&count=100`);
      for (const inv of collection) {
        const email = (inv.email ?? '').trim();
        if (!email) { skippedNoEmail += 1; continue; }
        const host = e.event_memberships?.[0]?.user_name?.trim();
        rows.push({
          name: splitName(inv.name || [inv.first_name, inv.last_name].filter(Boolean).join(' ')) || email.split('@')[0],
          email,
          phone: inv.text_reminder_number?.trim() || null,
          service: e.name?.trim() || 'Appointment',
          date: isoDate(new Date(e.start_time)),
          amountSpent: null,
          ...(host ? { staff: host } : {}),
        });
      }
    }
    return { rows, skippedNoEmail };
  },
};
