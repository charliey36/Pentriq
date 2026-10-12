import { captureError } from '@/lib/monitoring';

/**
 * A `fetch` for the Supabase clients that reports failed database and auth calls to Sentry.
 * supabase-js returns errors instead of throwing them, so without this most failed queries,
 * inserts, updates and RPCs would never be seen.
 *
 * Reported: 400 (bad query / missing column), 401 and 403 (row-level-security or permission
 * failures), and any 5xx on the REST/RPC API; 5xx and 429 on the auth API.
 * Skipped on purpose: 409 (unique violation, used for dedupe), 404 / 406 (no rows for
 * single()), 4xx on auth (wrong password, expired session are normal).
 * Only the table/function name, method, status and database error code are attached:
 * never the URL query string (it can hold emails), the request, or the response body.
 */
export function monitoredFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init).then(
    (res) => {
      if (!res.ok) report(input, init, res);
      return res;
    },
    (err) => {
      // Network failure reaching Supabase.
      captureError(err, { area: 'supabase:network', tags: { path: pathOf(input) } });
      throw err;
    }
  );
}

const pathOf = (input: RequestInfo | URL) => {
  try {
    return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
  } catch {
    return 'unknown';
  }
};

function report(input: RequestInfo | URL, init: RequestInit | undefined, res: Response) {
  const path = pathOf(input);
  const isAuth = path.startsWith('/auth/');
  const s = res.status;
  const wanted = isAuth ? s >= 500 || s === 429 : s >= 500 || s === 400 || s === 401 || s === 403;
  if (!wanted) return;

  const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
  const target = path.replace(/^\/(rest|auth)\/v1\//, '').replace(/^rpc\//, 'rpc:');
  // Read a copy so the caller can still use the response; keep only the error code and message.
  res
    .clone()
    .json()
    .then((body: { code?: string; message?: string; error_code?: string; msg?: string }) => {
      const message = body.message || body.msg || `HTTP ${s}`;
      captureError(Object.assign(new Error(`Supabase ${method} ${target} failed: ${message}`), { code: body.code || body.error_code }), {
        area: isAuth ? 'supabase:auth' : 'supabase:db',
        tags: { http_status: String(s), method, target },
      });
    })
    .catch(() => captureError(new Error(`Supabase ${method} ${target} failed: HTTP ${s}`), { area: isAuth ? 'supabase:auth' : 'supabase:db', tags: { http_status: String(s), method, target } }));
}
