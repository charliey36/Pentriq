import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { monitoredFetch } from '@/lib/supabase/monitored-fetch';

/**
 * Admin client using the SERVICE ROLE key. Bypasses Row Level Security.
 *
 * Only import this from server-only code that never runs in the browser:
 * API routes / route handlers, the seed script, the scheduled send job, and
 * the click-tracking redirect (which is hit by unauthenticated visitors, so
 * there is no user session to rely on).
 *
 * Never import this from a Client Component and never expose
 * SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    global: { fetch: monitoredFetch },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
