import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { reviewSendTime } from '@/lib/send-window';
import { cooldownDaysFor, daysSinceService, isCooldownActive, parseAmount, parseServiceDate } from '@/lib/eligibility';
import { normalizePhone } from '@/lib/phone';
import { resolveImportIdentities, type MatchedBy } from '@/lib/import-identity';
import type { CsvConfirmedMapping, CsvImportField } from '@/lib/csv-import-mapping';

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
  /** A new customer was created and the service recorded. */
  | { row: number; status: 'created'; name: string; email: string }
  /** An existing customer (matched on email or phone) was updated and the service recorded. */
  | { row: number; status: 'updated'; name: string; email: string; matchedBy: MatchedBy; note?: string }
  /** An existing customer was recognised by a row with no service date; nothing needed changing. */
  | { row: number; status: 'existing'; name: string; email: string; matchedBy: MatchedBy }
  /** The same service on the same date is already recorded for this customer. */
  | { row: number; status: 'skipped_duplicate'; name: string; email: string }
  /** Email and phone point at two different customers: nothing was written; needs a manual decision. */
  | { row: number; status: 'conflict'; name: string; email: string; reason: string }
  | { row: number; status: 'error'; name: string; email: string; reason: string };

export type BulkImportSummary = {
  totalRows: number;
  /** Customers that did not exist before this import. */
  customersCreated: number;
  /** Existing customers (matched on email or phone) whose record was updated. */
  customersUpdated: number;
  /** Existing customers recognised by a row with no service date, so nothing needed changing. */
  customersUnchanged: number;
  /** Service records added (one per imported row). */
  serviceRecordsAdded: number;
  /** Rows not imported because email and phone belong to two different customers. */
  conflicts: number;
  /** Rows skipped because that exact service is already recorded. */
  duplicates: number;
  errors: number;
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

type Valid = { row: number; name: string; email: string; service: string; date: string | null; phone: string | null; amount: number | null };
const KNOWN_COLUMNS = 'id, name, email, phone, total_spend, visit_count, last_service_date, unsubscribed_at';
type Known = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  total_spend: number;
  visit_count: number;
  last_service_date: string | null;
  unsubscribed_at: string | null;
};

/**
 * CSV import: every row is a completed service for a customer.
 *
 * Who a row belongs to is decided by email OR phone (never by name) — see
 * `resolveImportIdentities`. Per row:
 *   - no match                      → create the customer + record the service
 *   - email or phone matches        → update that customer + record the service
 *       (visit count, lifetime spend and last service date go up; existing
 *        name/email/phone are kept, a missing phone is filled in; every earlier
 *        service record is left untouched)
 *   - email and phone match two
 *     DIFFERENT customers           → conflict: nothing is written, the row is
 *                                     reported for manual review
 *   - identical service already recorded (same customer + service + date)
 *                                   → skipped, so re-uploading a file is safe
 * Recent services (inside the review window) put the customer in the review
 * queue; nothing is emailed unless `autoSend` is on. All database work is
 * batched. Throws on unexpected database errors.
 */
export async function bulkImportCustomers(
  supabase: Db,
  business: { id: string; delay_hours: number; review_request_window_days: number; review_cooldown_enabled?: boolean; review_cooldown_days?: number },
  rows: BulkImportRow[],
  autoSend: boolean,
  /** When the owner confirmed they may contact these customers; stored on every NEW customer. */
  consentConfirmedAt?: string
): Promise<BulkImportSummary> {
  const results: BulkImportRowResult[] = [];
  const fail = (e: { message: string }) => new Error(e.message);

  // 1. Validate rows and drop exact duplicates inside the file.
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
    // A blank date is allowed: the customer is added (or matched) with no service record.
    const date = rawDate ? parseServiceDate(/^\d{4}-\d{2}-\d{2}[T ]/.test(rawDate) ? rawDate.slice(0, 10) : rawDate) : null;
    if (rawDate && !date) return error('Invalid date. Use YYYY-MM-DD or DD/MM/YYYY.');
    if (date && (daysSinceService(date) ?? 0) < -1) return error('Date cannot be in the future.');
    const amount = date && r.amountSpent?.trim() ? parseAmount(r.amountSpent) : null;
    if (date && r.amountSpent?.trim() && amount === null) return error('Amount must be a number of 0 or more.');

    const key = `${email}|${service.toLowerCase()}|${date ?? 'no-date'}`;
    if (fileKeys.has(key)) return void results.push({ row, status: 'skipped_duplicate', name, email });
    fileKeys.add(key);
    valid.push({ row, name, email, service, date, phone: r.phone?.trim() || null, amount });
  });

  // 2. Load every existing customer a row could match: by email, and by phone.
  const known = new Map<string, Known>(); // customer id → customer
  for (const batch of chunks([...new Set(valid.map((v) => v.email))], 100)) {
    const { data, error } = await supabase.from('customers').select(KNOWN_COLUMNS).eq('business_id', business.id).in('email', batch);
    if (error) throw fail(error);
    (data ?? []).forEach((c) => known.set(c.id, c));
  }
  // Phones are stored as typed, so they can only be compared after normalising: read this
  // business's customers that have one and compare in code (fine at small-business scale).
  if (valid.some((v) => normalizePhone(v.phone))) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('customers')
        .select(KNOWN_COLUMNS)
        .eq('business_id', business.id)
        .not('phone', 'is', null)
        .order('id')
        .range(from, from + 999);
      if (error) throw fail(error);
      (data ?? []).forEach((c) => known.set(c.id, c));
      if (!data || data.length < 1000) break;
    }
  }

  // 3. Decide who each row belongs to; rows that would merge two different customers become conflicts.
  const identity = resolveImportIdentities(
    valid.map(({ row, name, email, phone }) => ({ row, name, email, phone })),
    [...known.values()].map(({ id, name, email, phone }) => ({ id, name, email, phone }))
  );
  const conflictRows = new Set(identity.conflicts.map((c) => c.row));
  const validByRow = new Map(valid.map((v) => [v.row, v]));
  for (const c of identity.conflicts) {
    const v = validByRow.get(c.row)!;
    results.push({ row: c.row, status: 'conflict', name: v.name, email: v.email, reason: c.reason });
  }
  const resolved = valid.filter((v) => !conflictRows.has(v.row));
  const entityOf = (v: Valid) => identity.entities.get(identity.rowEntity.get(v.row)!)!;

  // Rows with a service date record a service; rows without one only add or match the customer.
  type Dated = Valid & { date: string };
  const dated = resolved.filter((v): v is Dated => v.date !== null);
  const undated = resolved.filter((v) => v.date === null);

  // 4. Services: reuse by name (case-insensitive), create the missing ones.
  const serviceIds = new Map<string, string>();
  const { data: svc, error: svcError } = await supabase.from('services').select('id, name').eq('business_id', business.id);
  if (svcError) throw fail(svcError);
  (svc ?? []).forEach((s) => serviceIds.set(s.name.toLowerCase(), s.id));
  const missing = new Map<string, string>();
  dated.forEach((v) => !serviceIds.has(v.service.toLowerCase()) && missing.set(v.service.toLowerCase(), v.service));
  for (const batch of chunks([...missing.values()], 200)) {
    const { data, error } = await supabase.from('services').insert(batch.map((name) => ({ business_id: business.id, name }))).select('id, name');
    if (error) throw fail(error);
    (data ?? []).forEach((s) => serviceIds.set(s.name.toLowerCase(), s.id));
  }

  // 5. Skip service records that already exist (same customer + service + date).
  const existingIds = [...new Set(dated.map((v) => entityOf(v).existingId).filter((id): id is string => Boolean(id)))];
  const visitKeys = new Set<string>();
  for (const batch of chunks(existingIds, 100)) {
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
  type Accepted = Dated & { serviceId: string; entityKey: string };
  const accepted: Accepted[] = [];
  const seenInFile = new Set<string>();
  for (const v of dated) {
    const entity = entityOf(v);
    const serviceId = serviceIds.get(v.service.toLowerCase()) as string;
    const fileKey = `${entity.key}|${serviceId}|${v.date}`;
    const alreadyRecorded = Boolean(entity.existingId) && visitKeys.has(`${entity.existingId}|${serviceId}|${v.date}`);
    if (alreadyRecorded || seenInFile.has(fileKey)) {
      results.push({ row: v.row, status: 'skipped_duplicate', name: v.name, email: v.email });
      continue;
    }
    seenInFile.add(fileKey);
    accepted.push({ ...v, serviceId, entityKey: entity.key });
  }

  // 6. Per-customer totals for this import. Customers matched or added by a dateless row get a
  // zero entry so they are still created / recognised, but nothing is added to their history.
  const agg = new Map<string, { count: number; total: number; latest: string | null }>();
  for (const v of accepted) {
    const a = agg.get(v.entityKey) ?? { count: 0, total: 0, latest: v.date };
    a.count += 1;
    a.total += v.amount ?? 0;
    if (!a.latest || v.date > a.latest) a.latest = v.date;
    agg.set(v.entityKey, a);
  }
  for (const v of undated) {
    const key = entityOf(v).key;
    if (!agg.has(key)) agg.set(key, { count: 0, total: 0, latest: null });
  }

  // 7. Create new customers (with their totals) and update existing ones.
  const customerIdByKey = new Map<string, string>();
  const newKeys = [...agg.keys()].filter((k) => !identity.entities.get(k)!.existingId);
  const existingKeys = [...agg.keys()].filter((k) => identity.entities.get(k)!.existingId);
  // Only existing customers that actually change are "updated"; the rest were simply recognised.
  const changedKeys = existingKeys.filter((k) => agg.get(k)!.count > 0 || identity.entities.get(k)!.phoneToFill);
  existingKeys.forEach((k) => customerIdByKey.set(k, identity.entities.get(k)!.existingId!));

  for (const batch of chunks(newKeys, 200)) {
    const { data, error } = await supabase
      .from('customers')
      .insert(
        batch.map((k) => {
          const e = identity.entities.get(k)!;
          const a = agg.get(k)!;
          return {
            business_id: business.id,
            name: e.name,
            email: e.email,
            phone: e.phone,
            last_service_date: a.latest,
            total_spend: a.total,
            visit_count: a.count,
            ...(consentConfirmedAt ? { consent_confirmed_at: consentConfirmedAt } : {}),
          };
        })
      )
      .select('id, email');
    if (error) throw fail(error);
    const idByEmail = new Map((data ?? []).map((c) => [c.email.toLowerCase(), c.id]));
    batch.forEach((k) => customerIdByKey.set(k, idByEmail.get(identity.entities.get(k)!.email.toLowerCase())!));
  }
  for (const batch of chunks(changedKeys, 20)) {
    await Promise.all(
      batch.map(async (k) => {
        const entity = identity.entities.get(k)!;
        const c = known.get(entity.existingId!)!;
        const a = agg.get(k)!;
        const latest = a.latest && (!c.last_service_date || a.latest > c.last_service_date) ? a.latest : c.last_service_date;
        const { error } = await supabase
          .from('customers')
          .update({
            total_spend: Number(c.total_spend) + a.total,
            visit_count: c.visit_count + a.count,
            last_service_date: latest,
            ...(entity.phoneToFill ? { phone: entity.phoneToFill } : {}),
          })
          .eq('id', c.id)
          .eq('business_id', business.id);
        if (error) throw fail(error);
      })
    );
  }

  // 8. Record the service visits (date + amount). Earlier visits are never touched.
  const visitIdByKey = new Map<string, string>();
  for (const batch of chunks(accepted, 200)) {
    const { data, error } = await supabase
      .from('visits')
      .insert(
        batch.map((v) => ({
          business_id: business.id,
          customer_id: customerIdByKey.get(v.entityKey)!,
          service_id: v.serviceId,
          visited_at: `${v.date}T12:00:00Z`,
          price: v.amount,
          notes: 'Imported from CSV',
        }))
      )
      .select('id, customer_id, service_id, visited_at');
    if (error) throw fail(error);
    (data ?? []).forEach((v) => visitIdByKey.set(`${v.customer_id}|${v.service_id}|${v.visited_at.slice(0, 10)}`, v.id));
  }

  // 9. Row results for everything that was written.
  for (const v of accepted) {
    const entity = identity.entities.get(v.entityKey)!;
    if (!entity.existingId) {
      results.push({ row: v.row, status: 'created', name: v.name, email: v.email });
      continue;
    }
    const matchedBy = identity.matchedBy.get(v.row);
    const how: MatchedBy = matchedBy && matchedBy !== 'new' ? matchedBy : 'email';
    const emailDiffers = v.email !== entity.email.toLowerCase();
    results.push({
      row: v.row,
      status: 'updated',
      name: v.name,
      email: v.email,
      matchedBy: how,
      ...(emailDiffers ? { note: `Matched on ${how}; the email in your file differs from the one on record (${entity.email}), which was kept.` } : {}),
    });
  }

  // Rows without a service date: the customer was added or recognised, but no service was recorded.
  const reportedUndated = new Set<string>();
  const hasServiceThisImport = new Set(accepted.map((v) => v.entityKey));
  for (const v of undated) {
    const entity = entityOf(v);
    if (hasServiceThisImport.has(entity.key)) continue; // already reported through its dated row(s)
    if (reportedUndated.has(entity.key)) {
      results.push({ row: v.row, status: 'skipped_duplicate', name: v.name, email: v.email });
      continue;
    }
    reportedUndated.add(entity.key);
    const matchedBy = identity.matchedBy.get(v.row);
    const how: MatchedBy = matchedBy && matchedBy !== 'new' ? matchedBy : 'email';
    if (!entity.existingId) results.push({ row: v.row, status: 'created', name: v.name, email: v.email });
    else if (entity.phoneToFill) results.push({ row: v.row, status: 'updated', name: v.name, email: v.email, matchedBy: how, note: 'Phone number added; no service date, so no service record was added.' });
    else results.push({ row: v.row, status: 'existing', name: v.name, email: v.email, matchedBy: how });
  }

  // 10. Review queue: one request per customer, for their most recent service, if it is inside the review window.
  const latestVisit = new Map<string, Accepted>();
  accepted.forEach((v) => {
    const id = customerIdByKey.get(v.entityKey)!;
    const cur = latestVisit.get(id);
    if (!cur || v.date > cur.date) latestVisit.set(id, v);
  });

  const alreadyQueued = new Set<string>();
  for (const batch of chunks([...latestVisit.keys()], 100)) {
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

  // Optional cooldown: skip customers whose last SENT review request is too recent.
  const lastSent = new Map<string, string>();
  const cooldownDays = cooldownDaysFor(business);
  if (cooldownDays) {
    for (const batch of chunks([...latestVisit.keys()], 100)) {
      const { data, error } = await supabase
        .from('messages')
        .select('customer_id, sent_at')
        .eq('business_id', business.id)
        .eq('purpose', 'review_request')
        .eq('status', 'sent')
        .not('sent_at', 'is', null)
        .in('customer_id', batch);
      if (error) throw fail(error);
      (data ?? []).forEach((m) => {
        if (m.sent_at && (!lastSent.has(m.customer_id) || m.sent_at > lastSent.get(m.customer_id)!)) lastSent.set(m.customer_id, m.sent_at);
      });
    }
  }

  const toQueue = [...latestVisit.entries()].filter(([customerId, v]) => {
    if (cooldownDays && isCooldownActive(lastSent.get(customerId), cooldownDays, v.date)) return false;
    const days = daysSinceService(v.date);
    const unsubscribed = Boolean(known.get(customerId)?.unsubscribed_at);
    return !unsubscribed && !alreadyQueued.has(customerId) && days !== null && days >= 0 && days <= business.review_request_window_days;
  });

  // Held = waits in Customers until the owner presses Send. Scheduled = emailed the
  // day after the service at 8:00am, followed by the day-3 / day-7 reminders.
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
  }
  for (const batch of chunks(toQueue, 200)) {
    const enrollmentByCustomer = new Map<string, string>();
    if (journeyId) {
      const { data, error } = await supabase
        .from('journey_enrollments')
        .insert(batch.map(([customer_id]) => ({ journey_id: journeyId!, business_id: business.id, customer_id, current_step: 0 })))
        .select('id, customer_id');
      if (error) throw fail(error);
      (data ?? []).forEach((e) => enrollmentByCustomer.set(e.customer_id, e.id));
    }
    const messagePayload = batch.map(([customerId, v]) => ({
      business_id: business.id,
      customer_id: customerId,
      purpose: 'review_request',
      channel: 'email' as const,
      status: autoSend ? ('pending' as const) : ('queued' as const),
      send_at: (autoSend ? reviewSendTime(v.date) : new Date()).toISOString(),
      journey_enrollment_id: enrollmentByCustomer.get(customerId) ?? null,
      visit_id: visitIdByKey.get(`${customerId}|${v.serviceId}|${v.date}`) ?? null,
    }));
    const { error } = await supabase.from('messages').insert(messagePayload);
    if (error) throw fail(error);
  }

  results.sort((x, y) => x.row - y.row);
  const count = (status: BulkImportRowResult['status']) => results.filter((r) => r.status === status).length;
  return {
    totalRows: rows.length,
    customersCreated: newKeys.length,
    customersUpdated: changedKeys.length,
    customersUnchanged: existingKeys.length - changedKeys.length,
    serviceRecordsAdded: accepted.length,
    conflicts: count('conflict'),
    duplicates: count('skipped_duplicate'),
    errors: count('error'),
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
 * Maps parsed CSV rows into Pentriq's customer fields. Name and email are required;
 * date, service, phone and amount are optional. Confirmed mappings from the
 * local header/sample analysis take precedence over aliases.
 */
export function mapCsvRowsToCustomers(rows: string[][], confirmedMapping?: CsvConfirmedMapping): { rows: BulkImportRow[]; error?: string; warning?: string } {
  if (rows.length === 0) return { rows: [], error: 'The file is empty.' };

  // Normalize header: lowercase and remove spaces/underscores/hyphens for matching
  const originalHeader = rows[0];
  const normalizedHeader = originalHeader.map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ''));

  // Find column indices using comprehensive alias lists
  const find = (field: CsvImportField, aliases: string[]): number => confirmedMapping?.[field] ?? normalizedHeader.findIndex((h) => aliases.includes(h));

  const nameIndex = find('name', [
    'name',
    'fullname',
    'customername',
    'customer',
    'clientname',
    'contactname',
    'guestname',
    'membername',
    'username',
    'patientname',
    'leadname',
    'consumername',
    'accountname',
    'client',
  ]);
  const findNamePart = (aliases: string[]) => normalizedHeader.findIndex((header) => aliases.includes(header));
  const firstNameIndex = confirmedMapping?.firstName ?? (nameIndex === -1 ? findNamePart(['firstname', 'givenname', 'forename', 'christianname', 'first']) : -1);
  const lastNameIndex = confirmedMapping?.lastName ?? (nameIndex === -1 ? findNamePart(['lastname', 'surname', 'familyname', 'secondname', 'last', 'family']) : -1);

  const emailIndex = find('email', [
    'email',
    'emailaddress',
    'emailaddr',
    'e-mail',
  ]);

  const phoneIndex = find('phone', [
    'phone',
    'phonenumber',
    'phoneno',
    'mobile',
    'telephone',
    'tel',
  ]);

  const amountIndex = find('amount', [
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

  const serviceIndex = find('service', [
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

  const dateIndex = find('date', [
    'date',
    'servicedate',
    'datecompleted',
    'completeddate',
    'jobdate',
    'visitdate',
    'lastservicedate',
    'dateofservice',
  ]);

  // Only name and email are required. A service date is optional: a plain customer list can be
  // imported before any jobs exist, and those customers are added without a service record
  // (and so without a review request) until a dated service is imported or logged.
  const hasName = nameIndex >= 0 || (firstNameIndex >= 0 && lastNameIndex >= 0);
  const missing = [!hasName && 'name', emailIndex === -1 && 'email'].filter(Boolean);

  if (missing.length > 0) {
    const detectedHeaders = originalHeader.join(', ') || '(empty)';
    return {
      rows: [],
      error: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. 
Required: name, email
Optional: date, service, phone, amount

Your headers: ${detectedHeaders}

Supported aliases:
- NAME: name, customer, fullname, customername, clientname, client
- EMAIL: email, emailaddress, e-mail
- DATE: date, servicedate, datecompleted, completeddate, jobdate, visitdate (optional)
- SERVICE: service, servicetype, job, jobtype, description, workcompleted (optional)
- PHONE: phone, phonenumber, mobile, telephone (optional)
- AMOUNT: amount, amountspent, value, spend, revenue, price, cost, fee (optional)`,
    };
  }

  const cell = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() ?? '' : '');

  const warnings: string[] = [];
  if (dateIndex === -1) {
    warnings.push('No date column detected. These customers will be added without a service record, so no review requests are queued until you import or log a dated service.');
  } else if (serviceIndex === -1) {
    warnings.push("No service column detected. Imported customers will use 'General Service'.");
  }
  const result: BulkImportRow[] = rows.slice(1).map((r) => {
    const service = cell(r, serviceIndex) || 'General Service';
    const fullName = cell(r, nameIndex);
    const name = fullName || [cell(r, firstNameIndex), cell(r, lastNameIndex)].filter(Boolean).join(' ');

    return {
      name,
      email: cell(r, emailIndex),
      phone: cell(r, phoneIndex) || null,
      amountSpent: cell(r, amountIndex) || null,
      service,
      date: cell(r, dateIndex),
    };
  });

  return { rows: result, warning: warnings[0] };
}
