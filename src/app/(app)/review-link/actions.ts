'use server';

import { revalidatePath } from 'next/cache';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { userSafeError } from '@/lib/log';

/** Switches the public reviews widget on or off for the signed-in business. */
export async function setWidgetEnabled(enabled: boolean): Promise<{ error?: string }> {
  const business = await requireBusiness();
  const { error } = await createClient().from('businesses').update({ widget_enabled: Boolean(enabled) }).eq('id', business.id);
  if (error) return { error: userSafeError('Could not update the widget setting', error) };
  revalidatePath('/review-link');
  return {};
}
