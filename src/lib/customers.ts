import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { reviewSendTime } from '@/lib/send-window';
import { daysSinceService, parseAmount, parseServiceDate } from '@/lib/eligibility';

type Db = SupabaseClient<Database>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/** One CSV row: name,email,date (service defaults to "General Service", phone and amount are optional). */
export type BulkImportRow = {
  name: string;
  email: string;
  service: string;
  date: string;
  phone: string | null;
  amountSpent: string | null;
};

export type BulkImportRowResult =
  | { row: number; status: 'created'; name: string; email: string }
  | { row: number; status: 'skipped_duplicate'; name: string; email: string }
  | { row: number; status: 'error'; name: string; email: string; reason: string };

export type BulkImportSummary = {
  totalRows: number;
  /** Rows imported (each one is a service visit). */
  created: number;
  duplicates: number;
  errors: number;
  /** Customers that did not exist before this import. */
  newCustomers: number;
  /** Customers added to the review queue (or scheduled, if auto-send). */
  queued: number;
  /** Imported customers not queued: service older than the review window, or already queued. */
  notQueued: number;
  autoSend: boolean;
  results: BulkImportRowResult[];
  /** Warnings about the import (e.g., missing service column). */
  warning?: string;
};

const chunks = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

type Valid = { row: number; name: string; email: string; service: string; date: string; phone: string | null; amount: number | null };
type Known = { id: string; total_spend: number; visit_count: number; last_service_date: string | null; unsubscribed_at: string | null };

/**
 * CSV import: every row is a completed service. For each row we find or create
 * the customer (by email), find or create the service, and record a visit.
 * Rows with the same email + service + date as an existing visit (or an earlier
 * row in the file) are skipped, so re-uploading a file is safe. Recent services
 * (inside the review window) put the customer in the review queue; nothing is
 * emailed unless `autoSend` is on. All database work is batched. Throws on
 * unexpected database errors.
 */
export async function bulkImportCustomers(
  supabase: Db,
  business: { id: string; delay_hours: number; review_request_window_days: number },
  rows: BulkImportRow[],
  autoSend: boolean,
  /** When the owner confirmed they may contact these customers; stored on every NEW customer. */
  consentConfirmedAt?: string
): Promise<BulkImportSummary> {
  console.log(`[CSV Import] Starting import: ${rows.length} rows, autoSend=${autoSend}`);
  const results: BulkImportRowResult[] = [];
  const fail = (e: { message: string }) => new Error(e.message);

  // 1. Validate rows and drop duplicates inside the file.
  console.log('[CSV Import] Step 1: Validating rows...');
  const valid: Valid[] = [];
  const fileKeys = new Set<string>();
  rows.forEach((r, i) => {
    const row = i + 1;
    const name = r.name.trim();
    const email = r.email.trim().toLowerCase();
    const service = r.service.trim();
    const rawDate = r.date.trim();
    const error = (reason: string) => results.push({ row, status: 'error', name, email, reason });

    if (!name) return error('Name is required.');
    if (!isValidEmail(email)) return error('Invalid email address.');
    if (!service) return error('Service is required.');
    if (service.length > 120) return error('Service name is too long (max 120 characters).');
    const date = parseServiceDate(/^\d{4}-\d{2}-\d{2}[T ]/.test(rawDate) ? rawDate.slice(0, 10) : rawDate);
    if (!date) return error('Invalid date. Use YYYY-MM-DD or DD/MM/YYYY.');
    if ((daysSinceService(date) ?? 0) < -1) return error('Date cannot be in the future.');
    const amount = r.amountSpent?.trim() ? parseAmount(r.amountSpent) : null;
    if (r.amountSpent?.trim() && amount === null) return error('Amount must be a number of 0 or more.');

    const key = `${email}|${service.toLowerCase()}|${date}`;
    if (fileKeys.has(key)) return void results.push({ row, status: 'skipped_duplicate', name, email });
    fileKeys.add(key);
    valid.push({ row, name, email, service, date, phone: r.phone?.trim() || null, amount });
  });

  // 2. Existing customers (by email).
  console.log('[CSV Import] Step 2: Loading existing customers...');
  const known = new Map<string, Known>();
  for (const batch of chunks([...new Set(valid.map((v) => v.email))], 100)) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, email, total_spend, visit_count, last_service_date, unsubscribed_at')
      .eq('business_id', business.id)
      .in('email', batch);
    if (error) {
      console.error('[CSV Import] ERROR loading customers:', error);
      throw fail(error);
    }
    (data ?? []).forEach((c) => known.set(c.email.toLowerCase(), c));
  }
  console.log(`[CSV Import] Found ${known.size} existing customers`);

  // 3. Services: reuse by name (case-insensitive), create the missing ones.
  console.log('[CSV Import] Step 3: Processing services...');
  const serviceIds = new Map<string, string>();
  const { data: svc, error: svcError } = await supabase.from('services').select('id, name').eq('business_id', business.id);
  if (svcError) {
    console.error('[CSV Import] ERROR loading services:', svcError);
    throw fail(svcError);
  }
  (svc ?? []).forEach((s) => serviceIds.set(s.name.toLowerCase(), s.id));
  const missing = new Map<string, string>();
  valid.forEach((v) => !serviceIds.has(v.service.toLowerCase()) && missing.set(v.service.toLowerCase(), v.service));
  console.log(`[CSV Import] Found ${svc?.length ?? 0} existing services, creating ${missing.size} new ones`);
  for (const batch of chunks([...missing.values()], 200)) {
    const { data, error } = await supabase
      .from('services')
      .insert(batch.map((name) => ({ business_id: business.id, name })))
      .select('id, name');
    if (error) {
      console.error('[CSV Import] ERROR creating services:', error);
      throw fail(error);
    }
    (data ?? []).forEach((s) => serviceIds.set(s.name.toLowerCase(), s.id));
  }
  console.log('[CSV Import] Services ready');

  // 4. Skip visits that already exist (same customer + service + date).
  const visitKeys = new Set<string>();
  for (const batch of chunks([...known.values()].map((c) => c.id), 100)) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('visits')
        .select('customer_id, service_id, visited_at')
        .eq('business_id', business.id)
        .in('customer_id', batch)
        .range(from, from + 999);
      if (error) throw fail(error);
      (data ?? []).forEach((v) => visitKeys.add(`${v.customer_id}|${v.service_id}|${v.visited_at.slice(0, 10)}`));
      if (!data || data.length < 1000) break;
    }
  }
  const accepted: (Valid & { serviceId: string })[] = [];
  for (const v of valid) {
    const serviceId = serviceIds.get(v.service.toLowerCase()) as string;
    const existing = known.get(v.email);
    if (existing && visitKeys.has(`${existing.id}|${serviceId}|${v.date}`)) {
      console.log(`[CSV Import] Skipping duplicate: ${v.email} on ${v.date}`);
      results.push({ row: v.row, status: 'skipped_duplicate', name: v.name, email: v.email });
    } else {
      accepted.push({ ...v, serviceId });
    }
  }
  console.log(`[CSV Import] ${accepted.length} rows accepted (from ${valid.length} valid)`);

  // 5. Per-customer totals for this import.
  const agg = new Map<string, { name: string; phone: string | null; count: number; total: number; latest: string }>();
  for (const v of accepted) {
    const a = agg.get(v.email) ?? { name: v.name, phone: v.phone, count: 0, total: 0, latest: v.date };
    a.count += 1;
    a.total += v.amount ?? 0;
    if (v.date > a.latest) a.latest = v.date;
    agg.set(v.email, a);
  }

  // 6. Create new customers (with their totals), update existing ones.
  const newEmails = [...agg.keys()].filter((e) => !known.has(e));
  for (const batch of chunks(newEmails, 200)) {
    const { data, error } = await supabase
      .from('customers')
      .insert(
        batch.map((email) => {
          const a = agg.get(email)!;
          return {
            business_id: business.id,
            name: a.name,
            email,
            phone: a.phone,
            last_service_date: a.latest,
            total_spend: a.total,
            visit_count: a.count,
            ...(consentConfirmedAt ? { consent_confirmed_at: consentConfirmedAt } : {}),
          };
        })
      )
      .select('id, email');
    if (error) throw fail(error);
    (data ?? []).forEach((c) =>
      known.set(c.email, { id: c.id, total_spend: 0, visit_count: 0, last_service_date: agg.get(c.email)!.latest, unsubscribed_at: null })
    );
  }
  for (const batch of chunks([...agg.keys()].filter((e) => !newEmails.includes(e)), 20)) {
    await Promise.all(
      batch.map(async (email) => {
        const c = known.get(email)!;
        const a = agg.get(email)!;
        const latest = !c.last_service_date || a.latest > c.last_service_date ? a.latest : c.last_service_date;
        const { error } = await supabase
          .from('customers')
          .update({ total_spend: Number(c.total_spend) + a.total, visit_count: c.visit_count + a.count, last_service_date: latest })
          .eq('id', c.id);
        if (error) throw fail(error);
      })
    );
  }

  // 7. Record the visits (date + amount).
  console.log('[CSV Import] Step 7: Creating visits...');
  const visitIdByKey = new Map<string, string>();
  for (const batch of chunks(accepted, 200)) {
    console.log(`[CSV Import] Creating visit batch of ${batch.length}...`);
    const visitData = batch.map((v) => ({
      business_id: business.id,
      customer_id: known.get(v.email)!.id,
      service_id: v.serviceId,
      visited_at: `${v.date}T12:00:00Z`,
      price: v.amount,
      notes: 'Imported from CSV',
    }));
    console.log('[CSV Import] Visit batch data:', JSON.stringify(visitData.slice(0, 1)));
    
    const { data, error } = await supabase
      .from('visits')
      .insert(visitData)
      .select('id, customer_id, service_id, visited_at');
    if (error) {
      console.error('[CSV Import] ERROR creating visits:', error);
      throw fail(error);
    }
    (data ?? []).forEach((v) => visitIdByKey.set(`${v.customer_id}|${v.service_id}|${v.visited_at.slice(0, 10)}`, v.id));
  }
  console.log(`[CSV Import] Visits created: ${visitIdByKey.size} entries`);

  // 8. Review queue: one request per customer, for their most recent service, if it is inside the review window.
  console.log(`[CSV Import] Processing review queue: ${accepted.length} rows accepted`);
  const latestVisit = new Map<string, (typeof accepted)[number]>();
  accepted.forEach((v) => {
    const cur = latestVisit.get(v.email);
    if (!cur || v.date > cur.date) latestVisit.set(v.email, v);
  });
  console.log(`[CSV Import] Latest visits for ${latestVisit.size} customers`);
  
  const alreadyQueued = new Set<string>();
  for (const batch of chunks([...latestVisit.keys()].map((e) => known.get(e)!.id), 100)) {
    const { data, error } = await supabase
      .from('messages')
      .select('customer_id')
      .eq('business_id', business.id)
      .eq('purpose', 'review_request')
      .in('status', ['queued', 'pending'])
      .in('customer_id', batch);
    if (error) throw fail(error);
    (data ?? []).forEach((m) => alreadyQueued.add(m.customer_id));
  }
  console.log(`[CSV Import] Already queued: ${alreadyQueued.size} customers`);
  
  const toQueue = [...latestVisit.values()].filter((v) => {
    const c = known.get(v.email)!;
    const days = daysSinceService(v.date);
    const passes = !c.unsubscribed_at && !alreadyQueued.has(c.id) && days !== null && days >= 0 && days <= business.review_request_window_days;
    if (!passes) {
      console.log(`[CSV Import] Filtering out: ${v.email} - unsubscribed=${!!c.unsubscribed_at}, alreadyQueued=${alreadyQueued.has(c.id)}, days=${days}, window=${business.review_request_window_days}`);
    }
    return passes;
  });
  console.log(`[CSV Import] To queue: ${toQueue.length} messages`);

  // Held = waits in Customers until the owner presses Send. Scheduled = emailed the
  // day after the service between 9am and 12pm, followed by the day-3 / day-7 reminders.
  let journeyId: string | null = null;
  if (autoSend) {
    const { data: journey } = await supabase
      .from('journeys')
      .select('id')
      .eq('business_id', business.id)
      .eq('key', 'review_sequence')
      .eq('is_active', true)
      .maybeSingle();
    journeyId = journey?.id ?? null;
    console.log(`[CSV Import] autoSend=${autoSend}, journeyId=${journeyId}`);
  }
  for (const batch of chunks(toQueue, 200)) {
    console.log(`[CSV Import] Creating messages for batch of ${batch.length}`);
    const customerIds = batch.map((v) => known.get(v.email)!.id);
    const enrollmentByCustomer = new Map<string, string>();
    if (journeyId) {
      const { data, error } = await supabase
        .from('journey_enrollments')
        .insert(customerIds.map((customer_id) => ({ journey_id: journeyId!, business_id: business.id, customer_id, current_step: 0 })))
        .select('id, customer_id');
      if (error) throw fail(error);
      (data ?? []).forEach((e) => enrollmentByCustomer.set(e.customer_id, e.id));
      console.log(`[CSV Import] Created ${(data ?? []).length} journey enrollments`);
    }
    const messagePayload = batch.map((v) => {
      const customerId = known.get(v.email)!.id;
      return {
        business_id: business.id,
        customer_id: customerId,
        purpose: 'review_request',
        channel: 'email' as const,
        status: autoSend ? ('pending' as const) : ('queued' as const),
        send_at: (autoSend ? reviewSendTime(v.date) : new Date()).toISOString(),
        journey_enrollment_id: enrollmentByCustomer.get(customerId) ?? null,
        visit_id: visitIdByKey.get(`${customerId}|${v.serviceId}|${v.date}`) ?? null,
      };
    });
    
    console.log(`[CSV Import] First message payload:`, JSON.stringify(messagePayload[0]));
    
    const { error } = await supabase.from('messages').insert(messagePayload);
    if (error) {
      console.error('[CSV Import] ❌ ERROR inserting messages:', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        status: (error as any).status,
      });
      console.error('[CSV Import] Failed payload:', JSON.stringify(messagePayload[0], null, 2));
      throw fail(error);
    }
    console.log(`[CSV Import] Inserted ${batch.length} review request messages`);
  }
  console.log(`[CSV Import] Complete: queued=${toQueue.length}`);

  results.sort((x, y) => x.row - y.row);
  return {
    totalRows: rows.length,
    created: accepted.length,
    duplicates: results.filter((r) => r.status === 'skipped_duplicate').length,
    errors: results.filter((r) => r.status === 'error').length,
    newCustomers: newEmails.length,
    queued: toQueue.length,
    notQueued: latestVisit.size - toQueue.length,
    autoSend,
    results,
  };
}

/**
 * Minimal CSV parser sufficient for a simple name/email customer list.
 * Handles quoted fields (with escaped "" inside quotes) and both \n and
 * \r\n line endings. Not a full RFC 4180 implementation, but covers what
 * spreadsheet exports (Excel, Google Sheets, Apple Numbers) produce.
 */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM if present (common in Excel-exported CSVs).
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/**
 * Maps parsed CSV rows to import rows using intelligent header matching.
 * - Required columns: name, email, date
 * - Service is optional (defaults to "General Service" if missing)
 * - Supports common aliases from business software exports (Jobber, ServiceM8, Tradify, etc.)
 * - Case-insensitive and treats spaces/underscores/hyphens as identical
 */
export function mapCsvRowsToCustomers(rows: string[][]): { rows: BulkImportRow[]; error?: string; warning?: string } {
  if (rows.length === 0) return { rows: [], error: 'The file is empty.' };

  // Normalize header: lowercase and remove spaces/underscores/hyphens for matching
  const originalHeader = rows[0];
  const normalizedHeader = originalHeader.map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ''));

  // Find column indices using comprehensive alias lists
  const find = (aliases: string[]): number => normalizedHeader.findIndex((h) => aliases.includes(h));

  const nameIndex = find([
    'name',
    'fullname',
    'customername',
    'customer',
    'clientname',
    'client',
  ]);

  const emailIndex = find([
    'email',
    'emailaddress',
    'emailaddr',
    'e-mail',
  ]);

  const phoneIndex = find([
    'phone',
    'phonenumber',
    'phoneno',
    'mobile',
    'telephone',
    'tel',
  ]);

  const amountIndex = find([
    'amount',
    'amountspent',
    'value',
    'spend',
    'revenue',
    'price',
    'cost',
    'fee',
    'total',
  ]);

  const serviceIndex = find([
    'service',
    'servicetype',
    'servicename',
    'job',
    'jobtype',
    'jobname',
    'worktype',
    'work',
    'description',
    'workcompleted',
  ]);

  const dateIndex = find([
    'date',
    'servicedate',
    'datecompleted',
    'completeddate',
    'jobdate',
    'visitdate',
    'lastservicedate',
    'dateofservice',
  ]);

  // Check for required columns only (name, email, date)
  const missing = [
    nameIndex === -1 && 'name',
    emailIndex === -1 && 'email',
    dateIndex === -1 && 'date',
  ].filter(Boolean);

  if (missing.length > 0) {
    const detectedHeaders = originalHeader.join(', ') || '(empty)';
    return {
      rows: [],
      error: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. 
Required: name, email, date
Optional: service, phone, amount

Your headers: ${detectedHeaders}

Supported aliases:
- NAME: name, customer, fullname, customername, clientname, client
- EMAIL: email, emailaddress, e-mail
- DATE: date, servicedate, datecompleted, completeddate, jobdate, visitdate
- SERVICE: service, servicetype, job, jobtype, description, workcompleted (optional)
- PHONE: phone, phonenumber, mobile, telephone (optional)
- AMOUNT: amount, amountspent, value, spend, revenue, price, cost, fee (optional)`,
    };
  }

  const cell = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() ?? '' : '');

  let warning: string | undefined;
  const result: BulkImportRow[] = rows.slice(1).map((r) => {
    let service = cell(r, serviceIndex);
    if (!service && serviceIndex === -1) {
      service = 'General Service';
      warning = "No service column detected. Imported customers will use 'General Service'.";
    } else if (!service) {
      service = 'General Service';
    }

    return {
      name: cell(r, nameIndex),
      email: cell(r, emailIndex),
      phone: cell(r, phoneIndex) || null,
      amountSpent: cell(r, amountIndex) || null,
      service,
      date: cell(r, dateIndex),
    };
  });

  return { rows: result, warning };
}
