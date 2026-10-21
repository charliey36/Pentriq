'use server';

import { userSafeError } from '@/lib/log';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import type { SegmentCondition } from '@/lib/segments';

export type SegmentFormResult = { error?: string; success?: boolean };

export async function createSegment(
  _prev: SegmentFormResult,
  formData: FormData
): Promise<SegmentFormResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const name = String(formData.get('name') ?? '').trim();
  const field = String(formData.get('field') ?? '');
  const operator = String(formData.get('operator') ?? '');
  const value = String(formData.get('value') ?? '').trim();

  if (!name) return { error: 'Segment name is required.' };
  if (!field || !operator || !value) return { error: 'All condition fields are required.' };

  const condition: SegmentCondition = {
    field: field as SegmentCondition['field'],
    operator: operator as SegmentCondition['operator'],
    value,
  };

  const { error } = await supabase.from('segments').insert({
    business_id: business.id,
    name,
    rule_definition: [condition],
  });

  if (error) {
    return { error: userSafeError('Failed to create segment', error) };
  }

  revalidatePath('/segments');
  return { success: true };
}

export async function deleteSegment(segmentId: string) {
  const business = await requireBusiness();
  const supabase = createClient();

  await supabase.from('segments').delete().eq('id', segmentId).eq('business_id', business.id);
  revalidatePath('/segments');
}
