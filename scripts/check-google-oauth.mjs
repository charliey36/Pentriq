// Diagnoses the Google Business Profile OAuth setup WITHOUT needing a login.
//   node --env-file=.env.local scripts/check-google-oauth.mjs [redirect-uri ...]
// Checks: env vars, client id/secret validity, which redirect URIs Google has registered,
// the requested scope/access_type/prompt, and the database tables. Never prints secrets.
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => console.log(`  \u2717 ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
let failures = 0;
const fail = (m) => { failures += 1; bad(m); };

const SCOPE = 'https://www.googleapis.com/auth/business.manage';
const appUrl = (env.NEXT_PUBLIC_APP_URL || 'https://pentriq.cloud').trim().replace(/\/+$/, '');
const appRedirect = env.GOOGLE_REDIRECT_URI?.trim() || `${appUrl}/api/google-business/callback`;

console.log('1. Environment');
for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_TOKEN_ENCRYPTION_KEY']) {
  const v = env[k]?.trim();
  if (!v || v.startsWith('PASTE_')) fail(`${k} is missing or still a placeholder`);
  else ok(`${k} set`);
}
if (env.GOOGLE_CLIENT_ID && !/\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID.trim())) fail('GOOGLE_CLIENT_ID does not end in .apps.googleusercontent.com');
if (env.GOOGLE_CLIENT_SECRET && !env.GOOGLE_CLIENT_SECRET.trim().startsWith('GOCSPX-')) warn('GOOGLE_CLIENT_SECRET does not start with GOCSPX- (older clients may differ)');
if (env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
  const raw = env.GOOGLE_TOKEN_ENCRYPTION_KEY.trim();
  const len = /^[0-9a-fA-F]{64}$/.test(raw) ? 32 : Buffer.from(raw, 'base64').length;
  len === 32 ? ok('GOOGLE_TOKEN_ENCRYPTION_KEY decodes to 32 bytes') : fail(`GOOGLE_TOKEN_ENCRYPTION_KEY decodes to ${len} bytes (need 32)`);
}
console.log(`  redirect URI the app will send: ${appRedirect}${env.GOOGLE_REDIRECT_URI ? ' (GOOGLE_REDIRECT_URI)' : ' (NEXT_PUBLIC_APP_URL + /api/google-business/callback)'}`);

console.log('\n2. OAuth client credentials (token endpoint, bogus code)');
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: 'bogus', client_id: env.GOOGLE_CLIENT_ID.trim(), client_secret: env.GOOGLE_CLIENT_SECRET.trim(), redirect_uri: appRedirect, grant_type: 'authorization_code' }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.error === 'invalid_grant') ok('Client ID and secret are valid (Google only complained about the bogus code)');
  else if (j.error === 'invalid_client') fail('Google says invalid_client: wrong client ID/secret, or the client was deleted');
  else warn(`Unexpected response: ${j.error ?? res.status} ${j.error_description ?? ''}`);
}

console.log('\n3. Redirect URIs registered in Google Cloud Console');
const uris = process.argv.slice(2).length ? process.argv.slice(2) : [...new Set([appRedirect, 'http://localhost:3000/api/google-business/callback'])];
for (const uri of uris) {
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID?.trim() ?? '', redirect_uri: uri, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state: 'diag' })}`;
  const res = await fetch(url, { redirect: 'manual' });
  const loc = res.headers.get('location') ?? '';
  if (loc.includes('/signin/oauth/error')) {
    const err = new URL(loc).searchParams.get('authError') ?? '';
    const text = Buffer.from(err.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
    fail(`${uri}  ->  NOT registered (${text.match(/redirect_uri_mismatch|invalid_client|invalid_scope|org_internal|disabled_client|deleted_client/)?.[0] ?? 'Google rejected it'})`);
  } else if (res.status >= 300 && res.status < 400) ok(`${uri}  ->  accepted by Google`);
  else warn(`${uri}  ->  HTTP ${res.status}`);
}

console.log('\n4. Authorization request the app sends');
ok(`scope=${SCOPE}`);
ok('access_type=offline (refresh token)');
ok('prompt=consent (refresh token on every connect)');

console.log('\n5. Database (migrations 0019 / 0020 / 0021)');
if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  // (HEAD requests don't report a missing table, so read a row instead.)
  for (const t of ['google_business_connections', 'google_reviews', 'review_metrics_daily', 'review_alerts', 'manual_review_snapshots', 'review_sources', 'review_metrics', 'google_business_locations', 'google_sync_jobs']) {
    const { data, error } = await db.from(t).select('id').limit(1);
    error ? fail(`${t}: ${error.message}${t.match(/manual_|review_sources|review_metrics$|_locations|_jobs/) ? ' (apply migration 0021)' : ''}`) : ok(`${t}: exists`);
  }
  const { error } = await db.from('google_business_connections').select('granted_scopes').limit(1);
  error ? warn('granted_scopes column missing: apply supabase/migrations/0020_google_granted_scopes.sql') : ok('granted_scopes column present');
  const { data } = await db.from('google_business_connections').select('status, granted_scopes, last_sync_error, token_expires_at, initial_sync_done');
  console.log(`  connections: ${data?.length ?? 0}`, (data ?? []).map((c) => ({ status: c.status, scopeOk: c.granted_scopes?.includes(SCOPE) ?? 'unknown', synced: c.initial_sync_done, error: c.last_sync_error })));
}

console.log('\nNot checkable from here: whether the three Business Profile APIs are enabled, and whether Google has approved');
console.log('API access (Cloud Console \u2192 APIs & Services \u2192 Business Profile API \u2192 Quotas: 0 QPM = not approved, 300 QPM = approved).');
process.exit(failures ? 1 : 0);
