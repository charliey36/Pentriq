'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import { bulkImportCustomers, mapCsvRowsToCustomers, parseCsv } from '@/lib/customers';
import type { BulkImportSummary } from '@/lib/customers';
import { CONSENT_REQUIRED_MESSAGE, hasConsent } from '@/lib/consent';

export type ImportCustomersResult = { error?: string; summary?: BulkImportSummary };

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB is generous for a name/email CSV
const MAX_ROWS = 2000;

export async function importCustomers(
  _prev: ImportCustomersResult,
  formData: FormData
): Promise<ImportCustomersResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a CSV file to upload.' };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { error: 'File is too large (max 2MB).' };
  }

  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
    return { error: 'Please upload a .csv file.' };
  }

  const content = await file.text();
  const parsedRows = parseCsv(content);
  const { rows, error: mapError, warning: mapWarning } = mapCsvRowsToCustomers(parsedRows);

  if (mapError) {
    return { error: mapError };
  }

  if (rows.length === 0) {
    return { error: 'No customer rows found in the file.' };
  }

  if (rows.length > MAX_ROWS) {
    return { error: `This file has ${rows.length} rows; the limit is ${MAX_ROWS} per import.` };
  }

  if (!hasConsent(formData)) return { error: CONSENT_REQUIRED_MESSAGE };

  let summary: BulkImportSummary;
  try {
    console.log('[CSV Import] Starting import process');
    summary = await bulkImportCustomers(
      supabase,
      { id: business.id, delay_hours: business.delay_hours, review_request_window_days: business.review_request_window_days ?? 14 },
      rows,
      formData.get('auto_send') === 'on',
      new Date().toISOString()
    );
    if (mapWarning) {
      summary.warning = mapWarning;
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    
    // DO NOT MASK THE ERROR - LOG THE ACTUAL EXCEPTION
    console.error('❌ CSV IMPORT FAILED - ACTUAL ERROR:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('Full error object:', JSON.stringify(e, Object.getOwnPropertyNames(e)));
    
    // Re-throw the actual error message to the user
    return { error: `Import failed: ${error.message}` };
  }

  revalidatePath('/customers');
  revalidatePath('/dashboard');

  return { summary };
}
