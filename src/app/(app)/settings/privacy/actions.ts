'use server';

import { redirect } from 'next/navigation';
import { requireBusiness, getAuthUser } from '@/lib/business';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { stripeConfigured } from '@/lib/billing';
import { decryptToken } from '@/lib/google-token-crypto';
import { revokeToken } from '@/lib/google-business';
import { DELETE_CONFIRMATION } from './constants';

export type DeleteAccountResult = { error?: string };

/**
 * Permanently deletes the signed-in owner's account and every row that belongs
 * to the business (all tables cascade from `businesses`, and `businesses`
 * cascades from the auth user).
 *
 * Order matters:
 *  1. Stripe subscription is cancelled FIRST and the whole action aborts if
 *     that fails: deleting the data while the card is still being charged
 *     would be far worse than refusing to delete.
 *  2. Google access is revoked best-effort.
 *  3. The auth user is deleted (cascading to the business). If that fails
 *     nothing has been removed, so the user can simply try again.
 * Stripe keeps its own invoice records, which we are required to retain.
 */
export async function deleteAccount(_prev: DeleteAccountResult, fd: FormData): Promise<DeleteAccountResult> {
  const business = await requireBusiness();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  if (business.owner_id !== user.id) {
    return { error: 'Only the account owner can delete the account.' };
  }
  if (String(fd.get('confirm') ?? '').trim() !== DELETE_CONFIRMATION) {
    return { error: `Type ${DELETE_CONFIRMATION} to confirm.` };
  }

  const password = String(fd.get('password') ?? '');
  if (!password) {
    return { error: 'Enter your current password to continue.' };
  }
  if (!user.email) {
    return { error: 'We could not verify your account password. Please contact support.' };
  }

  // Re-authenticate immediately before the destructive operation. This uses
  // Supabase Auth rather than trusting the existing session alone, so a
  // stale browser session cannot delete the account without the password.
  const authClient = createClient();
  const { error: passwordError } = await authClient.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (passwordError) {
    return { error: 'Your password could not be verified. Nothing was deleted.' };
  }

  const admin = createAdminClient();

  // 1. Stop billing.
  const subscriptionId = business.stripe_subscription_id;
  if (subscriptionId) {
    if (!stripeConfigured()) {
      return { error: 'You have an active subscription but payments are not reachable right now. Please contact support so you are not charged after deletion.' };
    }
    try {
      await getStripe().subscriptions.cancel(subscriptionId);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'resource_missing') {
        console.error('[account-delete] could not cancel subscription:', e);
        return { error: 'We could not cancel your subscription, so nothing has been deleted. Please try again or contact support.' };
      }
    }
  }

  // 2. Revoke Google access (best effort; the row is deleted with the business either way).
  try {
    const { data: conn } = await admin.from('google_business_connections').select('refresh_token').eq('business_id', business.id).maybeSingle();
    if (conn?.refresh_token) await revokeToken(decryptToken(conn.refresh_token));
  } catch (e) {
    console.error('[account-delete] google revoke failed (continuing):', e);
  }

  // 3. Logo file, then the user (cascades to business and all its data).
  await admin.storage.from('business-logos').remove(['png', 'jpg', 'webp'].map((ext) => `${business.id}/logo.${ext}`)).catch(() => undefined);

  const { error: userError } = await admin.auth.admin.deleteUser(user.id);
  if (userError) {
    console.error('[account-delete] deleteUser failed:', userError.message);
    return { error: 'Could not delete your account. Nothing further has been removed; please try again or contact support.' };
  }
  // Belt and braces in case the cascade is missing on an older database.
  await admin.from('businesses').delete().eq('id', business.id);

  try {
    await createClient().auth.signOut();
  } catch {
    /* session is already invalid once the user is gone */
  }
  redirect('/?account=deleted');
}
