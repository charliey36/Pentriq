'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import { friendlySaveError, isMissingColumnError, missingColumnName } from '@/lib/db-errors';
import { parseSettingsForm } from '@/lib/settings-validation';

export type SaveSettingsResult = { error?: string; success?: boolean; fieldErrors?: { google_review_url?: string; booking_url?: string } };

export async function saveSettings(
  _prev: SaveSettingsResult,
  formData: FormData
): Promise<SaveSettingsResult> {
  const business = await requireBusiness();

  const parsed = parseSettingsForm(formData);
  if (!parsed.ok) {
    return { error: parsed.fieldErrors ? 'Please fix the highlighted fields.' : parsed.error, fieldErrors: parsed.fieldErrors };
  }

  try {
    const supabase = createClient();

    // `.select('id')` makes the write observable: an update that matches no
    // rows (e.g. blocked by RLS) returns [] with no error, which would
    // otherwise look like a successful save.
    const update = {
      ...parsed.values,
      ...((parsed.values.booking_url ?? null) !== (business.booking_url ?? null)
        ? { booking_url_updated_at: new Date().toISOString() }
        : {}),
    };
    let { data, error } = await supabase.from('businesses').update(update).eq('id', business.id).select('id');

    // Migration 0035 (cooldown columns) not applied yet: keep every other setting saving.
    if (error && missingColumnName(error)?.startsWith('review_cooldown')) {
      console.error('[Settings] Cooldown columns missing; apply supabase/migrations/0035_review_cooldown.sql');
      const { review_cooldown_enabled: _e, review_cooldown_days: _d, ...rest } = update;
      ({ data, error } = await supabase.from('businesses').update(rest).eq('id', business.id).select('id'));
    }

    if (error) {
      // Full technical detail goes to the server log; the user gets a safe message.
      console.error('[Settings] Failed to save business settings', {
        businessId: business.id,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        missingColumn: isMissingColumnError(error) ? missingColumnName(error) : undefined,
        fix: isMissingColumnError(error)
          ? missingColumnName(error)?.startsWith('booking_url')
            ? 'Apply supabase/migrations/0029_booking_url.sql (it also reloads the PostgREST schema cache).'
            : 'Apply supabase/migrations/0017_ensure_business_settings_columns.sql (it also reloads the PostgREST schema cache).'
          : undefined,
      });
      return { error: friendlySaveError(error) };
    }

    if (!data || data.length === 0) {
      console.error('[Settings] Update matched no rows (blocked by RLS or business missing)', {
        businessId: business.id,
      });
      return { error: "Your settings weren't saved because your account couldn't update this business. Please sign out and back in, then try again." };
    }
  } catch (e) {
    console.error('[Settings] Unexpected error saving business settings', { businessId: business.id, error: e });
    return { error: 'Something went wrong while saving your settings. Please try again in a moment.' };
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { success: true };
}

export type UploadLogoResult = { error?: string; success?: boolean; logoUrl?: string };

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Uploads a new profile picture / logo for the business to the
 * `business-logos` Storage bucket (see
 * supabase/migrations/0004_business_logo_storage.sql) and saves the
 * resulting public URL on businesses.brand_logo_url. Storage object path is
 * "<business_id>/logo.<ext>" so re-uploading overwrites the previous file
 * instead of accumulating orphaned images, and so the storage RLS policies
 * can authorize access by checking the business_id folder segment against
 * business_members.
 */
export async function uploadBusinessLogo(
  _prev: UploadLogoResult,
  formData: FormData
): Promise<UploadLogoResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const file = formData.get('logo');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image to upload.' };
  }

  const extension = ALLOWED_LOGO_TYPES[file.type];
  if (!extension) {
    return { error: 'Image must be a PNG, JPEG, or WEBP file.' };
  }

  if (file.size > MAX_LOGO_BYTES) {
    return { error: 'Image must be smaller than 2 MB.' };
  }

  const path = `${business.id}/logo.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('business-logos')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return { error: `Failed to upload image: ${uploadError.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('business-logos').getPublicUrl(path);

  // Cache-bust so the new image shows immediately even though the path is
  // the same as any previous upload.
  const logoUrl = `${publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('businesses')
    .update({ brand_logo_url: logoUrl })
    .eq('id', business.id);

  if (updateError) {
    return { error: `Failed to save image: ${updateError.message}` };
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { success: true, logoUrl };
}
