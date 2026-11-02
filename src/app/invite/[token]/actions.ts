'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { acceptInvitation } from '@/lib/team';
import { recordAudit } from '@/lib/audit';
import { requesterId, withinLimit } from '@/lib/rate-limit';

export type AcceptResult = { error?: string };

export async function acceptInvite(token: string, _prev: AcceptResult): Promise<AcceptResult> {
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  // Token guessing is infeasible (256-bit), but keep the endpoint from being hammered anyway.
  if (!(await withinLimit('invite-accept', requesterId(headers()), { limit: 20, windowSeconds: 600 }))) {
    return { error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const result = await acceptInvitation(createAdminClient() as never, { token, userId: user.id, userEmail: user.email });
  if (!result.ok) return { error: result.error };

  await recordAudit({ action: 'team.joined', businessId: result.businessId, actorId: user.id, actorEmail: user.email, targetType: 'user', targetId: user.id, ip: requesterId(headers()) });
  redirect('/dashboard');
}
