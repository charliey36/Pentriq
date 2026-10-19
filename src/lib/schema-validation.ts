import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { isMissingColumnError, missingColumnName } from '@/lib/db-errors';

type Db = SupabaseClient<Database>;

/** Columns on public.businesses that the Settings page reads and writes. */
export const REQUIRED_BUSINESS_COLUMNS = [
  'name',
  'google_review_url',
  'review_request_window_days',
  'rebooking_reminder_interval_days',
  'rebooking_reminders_enabled',
  'booking_url',
  'booking_url_updated_at',
] as const;

export interface SchemaValidationResult {
  isValid: boolean;
  missingColumns: string[];
  errors: string[];
}

/**
 * Validates that all required schema elements exist in the database.
 * Called on app startup to detect missing migrations early.
 * 
 * Returns a result object that can be logged or acted upon.
 * If invalid, the app should log clearly and potentially fail gracefully.
 */
export async function validateDatabaseSchema(supabase: Db): Promise<SchemaValidationResult> {
  const result: SchemaValidationResult = {
    isValid: true,
    missingColumns: [],
    errors: [],
  };

  try {
    // The four checks are independent, so run them concurrently (one round
    // trip of latency instead of four). Each works by attempting a query that
    // fails if a table/column is missing.
    const [messagesRes, visitsRes, customersRes, businessesRes] = await Promise.all([
      supabase.from('messages').select('id, visit_id, tracking_token, click_count').limit(1),
      supabase.from('visits').select('id, customer_id, service_id, visited_at').limit(1),
      supabase.from('customers').select('id, name, email, business_id').limit(1),
      supabase.from('businesses').select(REQUIRED_BUSINESS_COLUMNS.join(', ')).limit(1),
    ]);

    // Check if messages table has visit_id column
    const { error } = messagesRes;

    if (error) {
      if (error.message.includes('visit_id') && error.message.includes('schema cache')) {
        result.isValid = false;
        result.missingColumns.push('messages.visit_id');
        result.errors.push(
          'Missing required column: messages.visit_id\n' +
          'This column should exist from migration 0011_review_queue.sql or 0013_ensure_visit_id.sql\n' +
          'To fix: Run the missing migrations in your Supabase project via SQL editor:\n' +
          '  supabase/migrations/0013_ensure_visit_id.sql'
        );
      } else if (/tracking_token|click_count/.test(error.message)) {
        result.isValid = false;
        result.missingColumns.push('messages.tracking_token / messages.click_count');
        result.errors.push(
          'Missing review-link click tracking columns on messages.\n' +
          'Clicks will not be counted per send (and emails fall back to id-based links) until this is fixed.\n' +
          'To fix: run supabase/migrations/0018_review_link_click_tracking.sql in the Supabase SQL editor.'
        );
      } else {
        result.errors.push(`Messages table error: ${error.message}`);
      }
    }

    // Check if visits table exists and has required columns
    const { error: visitError } = visitsRes;

    if (visitError) {
      result.errors.push(`Visits table error: ${visitError.message}`);
    }

    // Check if customers table has required columns
    const { error: customerError } = customersRes;

    if (customerError) {
      result.errors.push(`Customers table error: ${customerError.message}`);
    }

    // Check businesses settings columns. Selecting them explicitly fails with
    // "Could not find the 'x' column ... in the schema cache" if a migration
    // (0007 / 0012 / 0017) has not been applied — surface that at startup
    // rather than on the first Settings save.
    const { error: businessError } = businessesRes;

    if (businessError) {
      if (isMissingColumnError(businessError)) {
        const column = missingColumnName(businessError) ?? 'unknown column';
        result.missingColumns.push(`businesses.${column}`);
        const migration = column.startsWith('booking_url')
          ? '0029_booking_url.sql'
          : '0017_ensure_business_settings_columns.sql';
        result.errors.push(
          `Missing required column: businesses.${column}\n` +
          'Settings cannot be saved until this is fixed.\n' +
          `To fix: run supabase/migrations/${migration} in the Supabase SQL editor\n` +
          "(it adds the column and runs NOTIFY pgrst, 'reload schema')."
        );
      } else {
        result.errors.push(`Businesses table error: ${businessError.message}`);
      }
    }

    if (result.errors.length > 0) {
      result.isValid = false;
    }
  } catch (e) {
    result.isValid = false;
    result.errors.push(`Unexpected validation error: ${e instanceof Error ? e.message : 'unknown error'}`);
  }

  return result;
}

// Result of the last check, kept per server process so the app shell doesn't
// re-run four database queries on every page load.
let lastResult: SchemaValidationResult | null = null;
let lastCheckedAt = 0;
let inFlight: Promise<SchemaValidationResult> | null = null;
const RECHECK_WHEN_INVALID_MS = 60_000;

/**
 * Runs validateDatabaseSchema at most once per server process while the
 * schema is healthy. If a problem was found it is re-checked at most once a
 * minute, so applying a migration clears the warning without a restart.
 * Concurrent callers share one in-flight check.
 */
export async function ensureSchemaValidated(supabase: Db): Promise<SchemaValidationResult> {
  const fresh = lastResult && (lastResult.isValid || Date.now() - lastCheckedAt < RECHECK_WHEN_INVALID_MS);
  if (fresh && lastResult) return lastResult;
  if (!inFlight) {
    inFlight = validateDatabaseSchema(supabase)
      .then((result) => {
        lastResult = result;
        lastCheckedAt = Date.now();
        logSchemaValidation(result);
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Logs schema validation results in a clear, actionable format.
 * Should be called during app startup.
 */
export function logSchemaValidation(result: SchemaValidationResult): void {
  if (result.isValid) {
    console.log('✓ Database schema validation passed');
    return;
  }

  console.error('\n❌ DATABASE SCHEMA VALIDATION FAILED\n');
  console.error('═══════════════════════════════════════════════════════════════');

  if (result.missingColumns.length > 0) {
    console.error('\nMissing columns:');
    result.missingColumns.forEach((col) => console.error(`  - ${col}`));
  }

  if (result.errors.length > 0) {
    console.error('\nErrors:');
    result.errors.forEach((err) => console.error(`  ${err}`));
  }

  console.error('\n═══════════════════════════════════════════════════════════════');
  console.error(
    '\nTo fix: Run the required migrations in your Supabase project:\n' +
    '  1. Go to your Supabase project dashboard\n' +
    '  2. Navigate to SQL editor\n' +
    '  3. Run the files in supabase/migrations/ in order\n' +
    '  4. Restart the application\n'
  );
}
