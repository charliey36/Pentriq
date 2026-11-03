/**
 * Data-subject rights for a business's own customers (UK GDPR Articles 15 and 17). The business is the
 * controller, so these are tools for the business to answer a request it receives from one of its customers.
 *
 *  - Access: everything Pentriq holds about one customer, as JSON.
 *  - Erasure: deletes the customer. Every table that references a customer cascades or clears the link
 *    (visits, messages, click events, feedback, tags, loyalty ledger, journeys, review requests; verified
 *    against the migrated schema in supabase/tests), and integration-log payloads that contain their email are
 *    removed too. Optionally their email stays on the business's do-not-contact list, so a later re-import
 *    cannot email them again.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { addSuppression } from '@/lib/safeguards';

type Db = SupabaseClient<Database>;

export const CUSTOMER_EXPORT_VERSION = 1;

export type CustomerExport = {
  format: 'pentriq.customer-export';
  version: number;
  generated_at: string;
  customer: Record<string, unknown>;
  tags: unknown[];
  visits: unknown[];
  messages: unknown[];
  review_requests: unknown[];
  link_clicks: unknown[];
  private_feedback: unknown[];
  loyalty_ledger: unknown[];
  referrals: unknown[];
  journey_enrollments: unknown[];
  on_do_not_contact_list: boolean;
};

/** Columns that are internal plumbing rather than information about the person. */
const INTERNAL = new Set(['tracking_token']);

function strip<T extends Record<string, unknown>>(rows: T[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !INTERNAL.has(k))));
}

export async function collectCustomerData(db: Db, businessId: string, customerId: string, now: Date = new Date()): Promise<CustomerExport | null> {
  const { data: customer } = await db.from('customers').select('*').eq('id', customerId).eq('business_id', businessId).maybeSingle();
  if (!customer) return null;

  // Same query shape for every table that holds rows about this customer (a generic helper, so loosely typed).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = db as unknown as { from(table: string): any };
  const scoped = (table: string, column = 'customer_id'): PromiseLike<{ data: Record<string, unknown>[] | null }> =>
    loose.from(table).select('*').eq('business_id', businessId).eq(column, customerId).limit(5000);

  const [tags, visits, messages, reviewRequests, clicks, feedback, ledger, referrerOf, refereeOf, journeys, suppression] = await Promise.all([
    scoped('customer_tags'),
    scoped('visits'),
    scoped('messages'),
    scoped('review_requests'),
    scoped('interaction_events'),
    scoped('private_feedback'),
    scoped('loyalty_ledger_entries'),
    scoped('referrals', 'referrer_customer_id'),
    scoped('referrals', 'referee_customer_id'),
    scoped('journey_enrollments'),
    db.from('email_suppressions').select('id').eq('business_id', businessId).eq('email', String(customer.email).trim().toLowerCase()).maybeSingle(),
  ]);

  return {
    format: 'pentriq.customer-export',
    version: CUSTOMER_EXPORT_VERSION,
    generated_at: now.toISOString(),
    customer: strip([customer as Record<string, unknown>])[0],
    tags: strip(tags.data),
    visits: strip(visits.data),
    messages: strip(messages.data),
    review_requests: strip(reviewRequests.data),
    link_clicks: strip(clicks.data),
    private_feedback: strip(feedback.data),
    loyalty_ledger: strip(ledger.data),
    referrals: strip([...(referrerOf.data ?? []), ...(refereeOf.data ?? [])]),
    journey_enrollments: strip(journeys.data),
    on_do_not_contact_list: Boolean(suppression.data),
  };
}

/** Escapes LIKE wildcards so an email such as a_b@x.co only matches itself. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type EraseResult = { ok: true; email: string; logsRemoved: number } | { ok: false; error: string };

/**
 * Permanently deletes one customer. `db` is the signed-in user's client (row-level security keeps it inside the
 * business); `admin` is the service-role client, used only for the server-only integration log.
 */
export async function eraseCustomer(
  db: Db,
  admin: Db,
  params: { businessId: string; customerId: string; confirmName: string; keepOnDoNotContactList: boolean }
): Promise<EraseResult> {
  const { data: customer } = await db.from('customers').select('id, name, email').eq('id', params.customerId).eq('business_id', params.businessId).maybeSingle();
  if (!customer) return { ok: false, error: 'Customer not found.' };
  if (params.confirmName.trim().toLowerCase() !== customer.name.trim().toLowerCase()) {
    return { ok: false, error: `Type the customer's name exactly ("${customer.name}") to confirm.` };
  }
  const email = String(customer.email).trim().toLowerCase();

  if (params.keepOnDoNotContactList && email) await addSuppression(db, params.businessId, email, 'erased');

  let logsRemoved = 0;
  if (email) {
    try {
      const { count } = await admin
        .from('integration_events')
        .delete({ count: 'exact' })
        .eq('business_id', params.businessId)
        .ilike('payload->>email', escapeLike(email));
      logsRemoved = count ?? 0;
    } catch {
      // Best effort: the log is trimmed by the retention policy as well.
    }
  }

  const { error } = await db.from('customers').delete().eq('id', params.customerId).eq('business_id', params.businessId);
  if (error) return { ok: false, error: 'Could not erase this customer. Please try again.' };
  return { ok: true, email, logsRemoved };
}
