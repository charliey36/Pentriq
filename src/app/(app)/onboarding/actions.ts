'use server';

import { userSafeError } from '@/lib/log';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/lib/business';
import { enrollCustomerInJourney } from '@/lib/journeys';
import { CONSENT_REQUIRED_MESSAGE, hasConsent } from '@/lib/consent';
import { validateBookingUrl } from '@/lib/booking-url';
import { suppressedEmails } from '@/lib/safeguards';

export type OnboardingResult = { error?: string };

/**
 * One-step setup: save business name + Google review link, add the first
 * customer and schedule their review request to send immediately.
 */
export async function completeOnboarding(_prev: OnboardingResult, fd: FormData): Promise<OnboardingResult> {
  const business = await requireBusiness();
  const supabase = createClient();

  const name = String(fd.get('name') ?? '').trim();
  const url = String(fd.get('google_review_url') ?? '').trim();
  const customerName = String(fd.get('customer_name') ?? '').trim();
  const bookingUrl = String(fd.get('booking_url') ?? '').trim();
  const customerEmail = String(fd.get('customer_email') ?? '').trim().toLowerCase();

  if (!name) return { error: 'Enter your business name.' };
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    return { error: 'Paste your full Google review link (starting with https://).' };
  }
  if (!customerName) return { error: 'Enter your customer’s name.' };
  const bookingError = validateBookingUrl(bookingUrl);
  if (bookingError) return { error: bookingError };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return { error: 'Enter a valid customer email.' };
  if (!hasConsent(fd)) return { error: CONSENT_REQUIRED_MESSAGE };

  const { error: bizError } = await supabase
    .from('businesses')
    .update({ name, google_review_url: url, booking_url: bookingUrl || null, ...(bookingUrl ? { booking_url_updated_at: new Date().toISOString() } : {}) })
    .eq('id', business.id);
  if (bizError) return { error: userSafeError('Could not save your business', bizError) };

  const { data: customer, error: custError } = await supabase
    .from('customers')
    .insert({
      business_id: business.id,
      name: customerName,
      email: customerEmail,
      last_service_date: new Date().toISOString().slice(0, 10),
      consent_confirmed_at: new Date().toISOString(),
      ...((await suppressedEmails(supabase, business.id, [customerEmail])).has(customerEmail) ? { unsubscribed_at: new Date().toISOString() } : {}),
    })
    .select('*')
    .single();
  if (custError || !customer) return { error: `Could not add customer: ${custError?.message ?? 'unknown error'}` };

  // First request goes out straight away (not next-day) so setup ends with a real send.
  const { data: journey } = await supabase
    .from('journeys')
    .select('*')
    .eq('business_id', business.id)
    .eq('key', 'review_sequence')
    .eq('is_active', true)
    .maybeSingle();
  if (journey) await enrollCustomerInJourney(supabase, journey, customer.id, new Date());

  redirect('/dashboard');
}
