/**
 * Settings save flow: validation, DB-error handling (incl. the missing
 * `rebooking_reminders_enabled` column / stale PostgREST schema cache that
 * caused the original incident), and the successful save path.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { parseSettingsForm } from '../settings-validation';
import {
  friendlySaveError,
  isMissingColumnError,
  missingColumnName,
} from '../db-errors';
import { validateDatabaseSchema, REQUIRED_BUSINESS_COLUMNS } from '../schema-validation';

// --- mocks for the server action -------------------------------------------
type UpdateResult = { data: { id: string }[] | null; error: Record<string, unknown> | null };
let updateResult: UpdateResult = { data: [{ id: 'biz-1' }], error: null };
const updateSpy = jest.fn();
const revalidatePathMock = jest.fn();

jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));
jest.mock('@/lib/business', () => ({ requireBusiness: async () => ({ id: 'biz-1' }) }));
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      update: (values: unknown) => {
        updateSpy(values);
        return { eq: () => ({ select: async () => updateResult }) };
      },
    }),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { saveSettings } = require('../../app/(app)/settings/actions') as typeof import('../../app/(app)/settings/actions');

function form(overrides: Record<string, string | null> = {}): FormData {
  const base: Record<string, string | null> = {
    name: 'Acme Coffee',
    google_review_url: 'https://g.page/r/abc123/review',
    booking_url: 'https://acme.com/book',
    contact_email: null,
    review_request_window_days: '14',
    rebooking_reminder_interval_days: '90',
    rebooking_reminders_enabled: 'on',
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) if (v !== null) fd.set(k, v);
  return fd;
}

const MISSING_COLUMN_ERROR = {
  code: 'PGRST204',
  message: "Could not find the 'rebooking_reminders_enabled' column of 'businesses' in the schema cache",
  details: null,
  hint: null,
};

describe('review cooldown settings', () => {
  it('is off with 60 days by default (existing behaviour)', () => {
    const r = parseSettingsForm(form());
    expect(r.ok && [r.values.review_cooldown_enabled, r.values.review_cooldown_days]).toEqual([false, 60]);
  });
  it('saves a custom period when enabled', () => {
    const r = parseSettingsForm(form({ review_cooldown_enabled: 'on', review_cooldown_days: '90' }));
    expect(r.ok && [r.values.review_cooldown_enabled, r.values.review_cooldown_days]).toEqual([true, 90]);
  });
  it('keeps the stored days when off and ignores a bad hidden value', () => {
    const r = parseSettingsForm(form({ review_cooldown_days: '45' }));
    expect(r.ok && [r.values.review_cooldown_enabled, r.values.review_cooldown_days]).toEqual([false, 45]);
  });
  it.each(['0', '366', '-3', ''])('rejects %p when enabled', (days) => {
    const r = parseSettingsForm(form({ review_cooldown_enabled: 'on', review_cooldown_days: days }));
    expect(r.ok).toBe(false);
  });
});

describe('parseSettingsForm (invalid values)', () => {
  it('accepts a valid form and maps every businesses column', () => {
    const r = parseSettingsForm(form());
    expect(r).toEqual({
      ok: true,
      values: {
        name: 'Acme Coffee',
        google_review_url: 'https://g.page/r/abc123/review',
        review_request_window_days: 14,
        rebooking_reminder_interval_days: 90,
        rebooking_reminders_enabled: true,
        review_cooldown_enabled: false,
        review_cooldown_days: 60,
        booking_url: 'https://acme.com/book',
        contact_email: null,
      },
    });
  });

  it('treats an unchecked toggle as false', () => {
    const r = parseSettingsForm(form({ rebooking_reminders_enabled: null }));
    expect(r.ok && r.values.rebooking_reminders_enabled).toBe(false);
  });

  it('requires both the review URL and the booking URL, reporting every problem', () => {
    const r = parseSettingsForm(form({ google_review_url: '  ', booking_url: '' }));
    expect(r).toMatchObject({
      ok: false,
      field: 'google_review_url',
      fieldErrors: { google_review_url: 'Google Review URL is required.', booking_url: 'Booking URL is required.' },
    });
  });

  it('rejects invalid URLs with friendly messages', () => {
    const r = parseSettingsForm(form({ google_review_url: 'not a url', booking_url: 'javascript:alert(1)' }));
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: {
        google_review_url: expect.stringContaining('valid Review URL'),
        booking_url: expect.stringContaining('valid Booking URL'),
      },
    });
  });

  it.each([
    ['empty name', { name: '  ' }, 'name'],
    ['over-long name', { name: 'x'.repeat(121) }, 'name'],
    ['non-URL review link', { google_review_url: 'not a url' }, 'google_review_url'],
    ['javascript: review link', { google_review_url: 'javascript:alert(1)' }, 'google_review_url'],
    ['zero window', { review_request_window_days: '0' }, 'review_request_window_days'],
    ['negative window', { review_request_window_days: '-5' }, 'review_request_window_days'],
    ['huge window', { review_request_window_days: '9999' }, 'review_request_window_days'],
    ['blank window', { review_request_window_days: '' }, 'review_request_window_days'],
    ['text window', { review_request_window_days: 'abc' }, 'review_request_window_days'],
    ['zero interval', { rebooking_reminder_interval_days: '0' }, 'rebooking_reminder_interval_days'],
    ['huge interval', { rebooking_reminder_interval_days: '100000' }, 'rebooking_reminder_interval_days'],
    ['missing interval', { rebooking_reminder_interval_days: null }, 'rebooking_reminder_interval_days'],
  ])('rejects %s', (_label, overrides, field) => {
    const r = parseSettingsForm(form(overrides));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe(field);
      expect(r.error.length).toBeGreaterThan(0);
    }
  });
});

describe('db error helpers (missing columns)', () => {
  it('recognises PostgREST schema-cache and Postgres undefined-column errors', () => {
    expect(isMissingColumnError(MISSING_COLUMN_ERROR)).toBe(true);
    expect(isMissingColumnError({ code: '42703', message: 'column businesses.foo does not exist' })).toBe(true);
    expect(isMissingColumnError({ message: 'column businesses.rebooking_reminders_enabled does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });

  it('extracts the column name', () => {
    expect(missingColumnName(MISSING_COLUMN_ERROR)).toBe('rebooking_reminders_enabled');
    expect(missingColumnName({ message: 'column businesses.foo does not exist' })).toBe('foo');
  });

  it('never leaks SQL / column internals in the user-facing message', () => {
    const msg = friendlySaveError(MISSING_COLUMN_ERROR);
    expect(msg).not.toMatch(/rebooking_reminders_enabled|schema cache|PGRST/i);
    expect(friendlySaveError({ code: '42501', message: 'permission denied' })).toMatch(/permission/i);
    expect(friendlySaveError({ message: 'boom' })).toMatch(/try again/i);
  });
});

describe('saveSettings action', () => {
  beforeEach(() => {
    updateSpy.mockClear();
    revalidatePathMock.mockClear();
    updateResult = { data: [{ id: 'biz-1' }], error: null };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('saves all settings fields and revalidates the page (successful save flow)', async () => {
    const result = await saveSettings({}, form({ review_request_window_days: '21', rebooking_reminder_interval_days: '120', rebooking_reminders_enabled: null }));
    expect(result).toEqual({ success: true });
    expect(updateSpy).toHaveBeenCalledWith({
      name: 'Acme Coffee',
      google_review_url: 'https://g.page/r/abc123/review',
      review_request_window_days: 21,
      rebooking_reminder_interval_days: 120,
      rebooking_reminders_enabled: false,
      review_cooldown_enabled: false,
      review_cooldown_days: 60,
      booking_url: 'https://acme.com/book',
      contact_email: null,
      booking_url_updated_at: expect.any(String),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });

  it('does not touch the database when validation fails', async () => {
    const result = await saveSettings({}, form({ review_request_window_days: '0' }));
    expect(result.error).toMatch(/between 1 and 365/);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns a friendly error and logs technical detail when a column is missing', async () => {
    updateResult = { data: null, error: MISSING_COLUMN_ERROR };
    const result = await saveSettings({}, form());
    expect(result.success).toBeUndefined();
    expect(result.error).toMatch(/database needs an update/i);
    expect(result.error).not.toMatch(/schema cache|rebooking_reminders_enabled/);
    expect(console.error).toHaveBeenCalledWith(
      '[Settings] Failed to save business settings',
      expect.objectContaining({
        businessId: 'biz-1',
        code: 'PGRST204',
        missingColumn: 'rebooking_reminders_enabled',
      })
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('does not report success when the update matched no rows (silent RLS failure)', async () => {
    updateResult = { data: [], error: null };
    const result = await saveSettings({}, form());
    expect(result.success).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('validateDatabaseSchema (startup check for missing columns)', () => {
  function supabaseWith(businessesError: Record<string, unknown> | null) {
    return {
      from: (table: string) => ({
        select: () => ({
          limit: async () => ({ data: [], error: table === 'businesses' ? businessesError : null }),
        }),
      }),
    } as never;
  }

  it('requires every Settings column', () => {
    expect([...REQUIRED_BUSINESS_COLUMNS]).toEqual([
      'name',
      'google_review_url',
      'review_request_window_days',
      'rebooking_reminder_interval_days',
      'rebooking_reminders_enabled',
      'booking_url',
      'booking_url_updated_at',
    ]);
  });

  it('flags a missing businesses column and points at migration 0017', async () => {
    const result = await validateDatabaseSchema(supabaseWith(MISSING_COLUMN_ERROR));
    expect(result.isValid).toBe(false);
    expect(result.missingColumns).toContain('businesses.rebooking_reminders_enabled');
    expect(result.errors.join('\n')).toContain('0017_ensure_business_settings_columns.sql');
  });

  it('passes when the schema is complete', async () => {
    const result = await validateDatabaseSchema(supabaseWith(null));
    expect(result.isValid).toBe(true);
  });
});
