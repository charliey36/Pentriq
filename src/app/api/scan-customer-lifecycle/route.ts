import { notifyOwner } from '@/lib/notifications';
import { isRebookingEligible } from '@/lib/eligibility';
import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { enrollCustomerInJourney } from '@/lib/journeys';
import { computeRebookingStatus } from '@/lib/visits';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

/**
 * Daily scheduled job: scans every business's customers for (a) rebooking
 * reminders — due per their last visit's service recurrence interval — and
 * (b) win-back candidates — lapsed per the same threshold used on the
 * customer detail page (computeRebookingStatus's isLapsed) — and (c)
 * birthday matches, enrolling each into the corresponding journey.
 * enrollCustomerInJourney is itself idempotent (skips if already actively
 * enrolled), so running this daily is safe even if a customer stays
 * due/lapsed across multiple runs.
 */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set.' }, { status: 500 });
  }

  if (!isCronAuthorized(request, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: businesses, error: businessesError } = await supabase.from('businesses').select('id, rebooking_reminder_interval_days, rebooking_reminders_enabled');
  if (businessesError) {
    captureError(businessesError, { area: 'cron:scan-customer-lifecycle' });
    return NextResponse.json({ error: businessesError.message }, { status: 500 });
  }

  // Trial-ending notice: trials ending within 3 days (sent once per business).
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const { data: endingTrials } = await supabase
    .from('businesses')
    .select('id')
    .eq('subscription_status', 'trialing')
    .gt('trial_ends_at', new Date().toISOString())
    .lte('trial_ends_at', soon)
    .is('trial_ending_email_sent_at', null);
  for (const b of endingTrials ?? []) await notifyOwner('trial_ending', b.id);

  let rebookingEnrolled = 0;
  let winBackEnrolled = 0;
  let birthdayEnrolled = 0;

  const todayMonth = new Date().getUTCMonth();
  const todayDate = new Date().getUTCDate();

  for (const business of businesses ?? []) {
    const [{ data: journeys }, { data: customers }] = await Promise.all([
      supabase.from('journeys').select('*').eq('business_id', business.id).eq('is_active', true),
      supabase.from('customers').select('*').eq('business_id', business.id).is('unsubscribed_at', null),
    ]);

    const rebookingJourney = business.rebooking_reminders_enabled === false ? undefined : journeys?.find((j) => j.key === 'rebooking_reminder');
    const winBackJourney = journeys?.find((j) => j.key === 'win_back');
    const birthdayJourney = journeys?.find((j) => j.key === 'birthday');

    for (const customer of customers ?? []) {
      if (birthdayJourney && customer.date_of_birth) {
        const dob = new Date(customer.date_of_birth);
        if (dob.getUTCMonth() === todayMonth && dob.getUTCDate() === todayDate) {
          await enrollCustomerInJourney(supabase, birthdayJourney, customer.id);
          birthdayEnrolled += 1;
        }
      }

      // Service-date rule: reminder once `rebooking_reminder_interval_days` have passed,
      // at most once per service (skip if already enrolled since that service date).
      if (rebookingJourney && customer.last_service_date &&
          isRebookingEligible(customer.last_service_date, business.rebooking_reminder_interval_days ?? 90)) {
        const { count } = await supabase
          .from('journey_enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('journey_id', rebookingJourney.id)
          .eq('customer_id', customer.id)
          .gte('enrolled_at', `${customer.last_service_date}T00:00:00Z`);
        if (!count) {
          await enrollCustomerInJourney(supabase, rebookingJourney, customer.id);
          rebookingEnrolled += 1;
        }
        continue;
      }

      if (!rebookingJourney && !winBackJourney) continue;

      const { data: visits } = await supabase
        .from('visits')
        .select('*')
        .eq('customer_id', customer.id)
        .order('visited_at', { ascending: false })
        .limit(1);

      if (!visits || visits.length === 0) continue;

      const { data: service } = visits[0].service_id
        ? await supabase.from('services').select('recurrence_interval_days').eq('id', visits[0].service_id).maybeSingle()
        : { data: null };

      const status = computeRebookingStatus(visits, service?.recurrence_interval_days ?? null);

      if (status.isLapsed && winBackJourney) {
        await enrollCustomerInJourney(supabase, winBackJourney, customer.id);
        winBackEnrolled += 1;
      } else if (status.isDue && rebookingJourney) {
        await enrollCustomerInJourney(supabase, rebookingJourney, customer.id);
        rebookingEnrolled += 1;
      }
    }
  }

  return NextResponse.json({ rebookingEnrolled, winBackEnrolled, birthdayEnrolled });
}
