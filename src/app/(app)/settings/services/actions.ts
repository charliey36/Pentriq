'use server';

import { userSafeError } from '@/lib/log';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';

export type ServiceFormResult = { error?: string; success?: boolean };

export async function createService(
  _prev: ServiceFormResult,
  formData: FormData
): Promise<ServiceFormResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const name = String(formData.get('name') ?? '').trim();
  const intervalRaw = String(formData.get('recurrence_interval_days') ?? '').trim();
  const priceRaw = String(formData.get('default_price') ?? '').trim();

  if (!name) {
    return { error: 'Service name is required.' };
  }

  const recurrenceIntervalDays = intervalRaw ? Number(intervalRaw) : null;
  if (recurrenceIntervalDays !== null && (!Number.isFinite(recurrenceIntervalDays) || recurrenceIntervalDays <= 0)) {
    return { error: 'Rebooking interval must be a positive number of days.' };
  }

  const defaultPrice = priceRaw ? Number(priceRaw) : null;
  if (defaultPrice !== null && (!Number.isFinite(defaultPrice) || defaultPrice < 0)) {
    return { error: 'Price must be a positive number.' };
  }

  const { error } = await supabase.from('services').insert({
    business_id: business.id,
    name,
    recurrence_interval_days: recurrenceIntervalDays,
    default_price: defaultPrice,
  });

  if (error) {
    return { error: userSafeError('Failed to create service', error) };
  }

  revalidatePath('/settings/services');
  return { success: true };
}

export async function deactivateService(serviceId: string) {
  const business = await requireBusiness();
  const supabase = createClient();

  await supabase
    .from('services')
    .update({ is_active: false })
    .eq('id', serviceId)
    .eq('business_id', business.id);

  revalidatePath('/settings/services');
}
