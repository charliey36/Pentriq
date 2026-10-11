import { createAdminClient } from '@/lib/supabase/admin';
import { processServiceVisit } from '@/lib/review-automation';
import { parseServiceDate } from '@/lib/eligibility';
import { isValidEmail } from '@/lib/customers';

export type ServiceImportInput = {
  name: string;
  email: string; // already trimmed + lowercased
  phone: string;
  amount: number;
  serviceDate: string; // YYYY-MM-DD, already validated
};

/**
 * Shared by the API endpoint and the demo company sync: finds/creates the
 * customer by email, records the visit (idempotent), updates stats, fires the hook.
 */
export async function importServiceVisit(businessId: string, input: ServiceImportInput) {
  const { name, email, phone, amount, serviceDate } = input;
  const db = createAdminClient();

  const { data: existing, error: lookupError } = await db
    .from('customers')
    .select('id, name, phone')
    .eq('business_id', businessId)
    .eq('email', email)
    .maybeSingle();
  if (lookupError) throw new Error(`Customer lookup failed: ${lookupError.message}`);

  let customerId: string;
  let customerCreated = false;

  if (existing) {
    customerId = existing.id;
    const update: { name?: string; phone?: string } = {};
    if (name !== existing.name) update.name = name;
    if (phone && phone !== existing.phone) update.phone = phone;
    if (Object.keys(update).length > 0) await db.from('customers').update(update).eq('id', customerId);
  } else {
    const { data: created, error } = await db
      .from('customers')
      .insert({ business_id: businessId, name, email, phone: phone || null })
      .select('id')
      .single();
    if (error || !created) throw new Error('Could not create customer.');
    customerId = created.id;
    customerCreated = true;
  }

  // Same customer + date + amount = same visit (safe for retries).
  const visitedAt = `${serviceDate}T12:00:00Z`;
  const { data: dup } = await db
    .from('visits')
    .select('id')
    .eq('customer_id', customerId)
    .eq('visited_at', visitedAt)
    .eq('price', amount)
    .limit(1);
  if (dup && dup.length > 0) return { customerId, visitId: dup[0].id, customerCreated, duplicate: true };

  const { data: visit, error: visitError } = await db
    .from('visits')
    .insert({ business_id: businessId, customer_id: customerId, visited_at: visitedAt, price: amount, notes: 'Imported' })
    .select('id')
    .single();
  if (visitError || !visit) throw new Error('Could not record service visit.');

  // Recalculate stats from the visits themselves so retries/races can't drift.
  const { data: all } = await db.from('visits').select('price, visited_at').eq('customer_id', customerId);
  const totalSpend = (all ?? []).reduce((sum, v) => sum + (v.price ?? 0), 0);
  const latest = (all ?? []).reduce((max, v) => (v.visited_at > max ? v.visited_at : max), visitedAt).slice(0, 10);
  const { error: statsError } = await db
    .from('customers')
    .update({ last_service_date: latest, total_spend: totalSpend, visit_count: all?.length ?? 1 })
    .eq('id', customerId);
  if (statsError) throw new Error(`Could not update customer statistics: ${statsError.message}`);

  await processServiceVisit({ businessId, customerId, visitId: visit.id, serviceDate });
  return { customerId, visitId: visit.id, customerCreated, duplicate: false };
}

// ---------------------------------------------------------------------------
// Request handling shared by the API endpoint and the dashboard "Test import":
// validate -> import -> log. Returns the HTTP status and JSON body to send.
// ---------------------------------------------------------------------------

const ENDPOINT = '/api/integrations/service-completed';

export async function logIntegrationEvent(
  businessId: string,
  source: 'api' | 'test',
  status: 'imported' | 'updated' | 'duplicate' | 'failed',
  message: string,
  payload: unknown
) {
  try {
    await createAdminClient()
      .from('integration_events')
      .insert({ business_id: businessId, source, endpoint: ENDPOINT, status, message, payload: payload as never });
  } catch {
    // Logging must never break the import.
  }
}

/** Automation tools often send every value as a string, so accept "350", "£1,250.50" etc. */
function toAmount(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[£$€,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function handleServiceCompleted(businessId: string, body: unknown, source: 'api' | 'test') {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const name = str(b.customerName);
  const email = str(b.email).toLowerCase();
  const phone = str(b.phone);
  const amount = toAmount(b.amountSpent);
  // Accept YYYY-MM-DD, DD/MM/YYYY, or an ISO timestamp (date part is used).
  const rawDate = str(b.serviceDate);
  const serviceDate = parseServiceDate(/^\d{4}-\d{2}-\d{2}T/.test(rawDate) ? rawDate.slice(0, 10) : rawDate);

  const errors: string[] = [];
  if (!name) errors.push('Customer name is required');
  else if (name.length > 200) errors.push('Customer name must be 200 characters or fewer');
  if (!email) errors.push('Email is required');
  else if (!isValidEmail(email)) errors.push('Email is not a valid email address');
  if (phone.length > 40) errors.push('Phone must be 40 characters or fewer');
  if (amount === null || amount < 0 || amount > 1_000_000) errors.push('Amount spent must be a number of 0 or more');
  if (!rawDate) errors.push('Service date is required');
  else if (!serviceDate) errors.push('Service date must be in YYYY-MM-DD format');
  else if (Date.parse(serviceDate) > Date.now() + 86_400_000) errors.push('Service date cannot be in the future');

  if (errors.length > 0 || !serviceDate || amount === null) {
    await logIntegrationEvent(businessId, source, 'failed', `Validation failed: ${errors.join('; ')}`, body);
    return { status: 400, body: { success: false, errors } };
  }

  try {
    const r = await importServiceVisit(businessId, { name, email, phone, amount, serviceDate });
    const [status, message] = r.duplicate
      ? (['duplicate', `Duplicate ignored: ${email}`] as const)
      : r.customerCreated
        ? (['imported', `Service imported: new customer ${email}. Review automation triggered`] as const)
        : (['updated', `Customer updated: ${email}. Service imported. Review automation triggered`] as const);
    await logIntegrationEvent(businessId, source, status, message, body);
    return { status: 200, body: { success: true, ...r } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed.';
    await logIntegrationEvent(businessId, source, 'failed', `Error: ${msg}`, body);
    return { status: 500, body: { success: false, errors: [msg] } };
  }
}
