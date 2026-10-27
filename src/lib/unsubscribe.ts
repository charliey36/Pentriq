/**
 * The one implementation of "this customer opted out", used by the public
 * unsubscribe link (GET) and the one-click mail-client request (POST).
 *
 *  1. marks the customer unsubscribed (kept if already set, so the original time stands)
 *  2. adds their email to the business's suppression list, which outlives the customer
 *     record, so deleting and re-importing them cannot bring them back
 *  3. cancels everything still waiting to send to them and ends their active journeys
 *
 * Idempotent: calling it twice is harmless.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { addSuppression } from '@/lib/safeguards';

export async function unsubscribeCustomer(supabase: SupabaseClient<Database>, customerId: string): Promise<'ok' | 'not_found'> {
  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, business_id, email, unsubscribed_at')
    .eq('id', customerId)
    .maybeSingle();
  if (error || !customer) return 'not_found';

  if (!customer.unsubscribed_at) {
    await supabase.from('customers').update({ unsubscribed_at: new Date().toISOString() }).eq('id', customerId);
  }
  await addSuppression(supabase, customer.business_id, customer.email);

  // Messages (journey reminders, held requests) and the legacy review_requests table.
  await supabase.from('messages').update({ status: 'cancelled', last_error: 'Customer unsubscribed' }).eq('customer_id', customerId).in('status', ['queued', 'pending']);
  await supabase.from('journey_enrollments').update({ status: 'exited' }).eq('customer_id', customerId).eq('status', 'active');
  await supabase.from('review_requests').update({ status: 'cancelled' }).eq('customer_id', customerId).eq('status', 'pending');
  return 'ok';
}
