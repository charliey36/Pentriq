'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import { bulkImportCustomers, mapCsvRowsToCustomers, parseCsv } from '@/lib/customers';
import type { BulkImportSummary } from '@/lib/customers';
import { analyzeCsvMapping, CSV_IMPORT_FIELDS, type CsvConfirmedMapping, type CsvMappingAnalysis } from '@/lib/csv-import-mapping';
import { CONSENT_REQUIRED_MESSAGE, hasConsent } from '@/lib/consent';

export type ImportCustomersResult = { error?: string; summary?: BulkImportSummary };
export type AnalyzeImportResult = { error?: string; mapping?: CsvMappingAnalysis };

async function readCsvFile(formData: FormData): Promise<{ rows?: string[][]; error?: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a CSV file to upload.' };
  if (file.size > MAX_FILE_BYTES) return { error: 'File is too large (max 2MB).' };
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') return { error: 'Please upload a .csv file.' };
  const rows = parseCsv(await file.text());
  if (rows.length > MAX_ROWS + 1) return { error: `This file has ${rows.length - 1} rows; the limit is ${MAX_ROWS} per import.` };
  return { rows };
}

export async function analyzeCsv(_prev: AnalyzeImportResult, formData: FormData): Promise<AnalyzeImportResult> {
  await requireBusiness();
  const parsed = await readCsvFile(formData);
  if (parsed.error) return { error: parsed.error };
  const analysis = analyzeCsvMapping(parsed.rows!);
  return 'error' in analysis ? { error: analysis.error } : { mapping: analysis };
}

function confirmedMapping(formData: FormData): CsvConfirmedMapping | undefined {
  const fields = [...CSV_IMPORT_FIELDS, 'firstName', 'lastName'] as const;
  const values = Object.fromEntries(
    fields.map((field) => [field, String(formData.get(`mapping_${field}`) ?? '')])
  );
  if (!Object.values(values).some(Boolean)) return undefined;
  return Object.fromEntries(
    fields.filter((field) => values[field] !== '' && /^\d+$/.test(values[field])).map((field) => [field, Number(values[field])])
  ) as CsvConfirmedMapping;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB is generous for a name/email CSV
const MAX_ROWS = 2000;

export async function importCustomers(
  _prev: ImportCustomersResult,
  formData: FormData
): Promise<ImportCustomersResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const parsedFile = await readCsvFile(formData);
  if (parsedFile.error) return { error: parsedFile.error };
  const parsedRows = parsedFile.rows!;
  const selectedMapping = confirmedMapping(formData);
  if (selectedMapping && selectedMapping.name === selectedMapping.email) {
    return { error: 'Name and email must use different CSV columns.' };
  }
  if (selectedMapping && selectedMapping.firstName !== undefined && selectedMapping.firstName === selectedMapping.lastName) {
    return { error: 'First name and last name must use different CSV columns.' };
  }
  const { rows, error: mapError, warning: mapWarning } = mapCsvRowsToCustomers(parsedRows, selectedMapping);

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
      { id: business.id, delay_hours: business.delay_hours, review_request_window_days: business.review_request_window_days ?? 1, review_cooldown_enabled: business.review_cooldown_enabled, review_cooldown_days: business.review_cooldown_days },
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
