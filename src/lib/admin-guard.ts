import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin-access';

/** For admin API routes: null when the caller is an authenticated admin, otherwise a 401/403 response. */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const { data } = await createClient().auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!isAdminEmail(data.user.email)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  return null;
}
