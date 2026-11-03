import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/business';
import { adminAccess } from '@/lib/admin-access';

/** For admin API routes: null when the caller is an admin with a two-factor session, otherwise a 401/403 response. */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = adminAccess(user);
  if (access === 'forbidden') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  if (access !== 'ok') return NextResponse.json({ error: 'Two-factor authentication required.' }, { status: 403 });
  return null;
}
