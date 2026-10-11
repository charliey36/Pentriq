/**
 * Structured, secret-free logging for the Google OAuth / Business Profile flow.
 *
 * Every line is `[google-oauth] {json}` so it is greppable in Vercel logs or the
 * dev terminal. Authorization codes, tokens and the client secret are NEVER
 * logged: callers pass only booleans/lengths for those, and `redact` strips any
 * accidental key that looks sensitive.
 */

const SENSITIVE = /token|secret|code$|authorization|password|key/i;

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    // Booleans / numbers under a sensitive-looking name (e.g. hasRefreshToken) are safe flags.
    out[k] = SENSITIVE.test(k) && typeof v === 'string' ? '[redacted]' : v;
  }
  return out;
}

export type OAuthLogEvent =
  | 'authorize_start'
  | 'authorize_blocked'
  | 'callback_received'
  | 'callback_google_error'
  | 'state_check_failed'
  | 'token_exchange_failed'
  | 'token_exchange_ok'
  | 'scope_missing'
  | 'accounts_list_failed'
  | 'accounts_empty'
  | 'connection_save_failed'
  | 'connection_saved'
  | 'token_refresh_failed'
  | 'api_call_failed';

export function logGoogleOAuth(
  level: 'info' | 'warn' | 'error',
  event: OAuthLogEvent,
  fields: Record<string, unknown> = {}
) {
  const line = `[google-oauth] ${JSON.stringify({ event, at: new Date().toISOString(), ...redact(fields) })}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
