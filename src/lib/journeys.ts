import { snapToSendWindow } from '@/lib/send-window';
/**
 * Minimal journey engine. A journey (see `journeys` table) is an ordered
 * list of steps: [{wait_hours, channel, purpose}, ...]. Enrolling a
 * customer creates a `journey_enrollments` row at step 0 and schedules a
 * `messages` row for step 1 at now()+steps[0].wait_hours. Advancing an
 * enrollment (called by the scheduler after a step's message is sent, or
 * cancelled early by a stop-condition like a click) schedules the next
 * step's message, or marks the enrollment completed once steps are
 * exhausted.
 *
 * This single engine backs review sequences (A2), rebooking reminders
 * (B2), win-back (C3), and birthday campaigns (C4) — see
 * lib/journeys-config.ts for how each feature's cron job uses it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Journey } from '@/lib/database.types';

export async function enrollCustomerInJourney(
  supabase: SupabaseClient<Database>,
  journey: Journey,
  customerId: string,
  firstSendAt?: Date,
  /** The visit this sequence is about, so the first email can mention the service, staff member and date. */
  visitId?: string | null
): Promise<void> {
  // Don't double-enroll: if this customer already has an active enrollment
  // in this journey, leave it alone.
  const { data: existing } = await supabase
    .from('journey_enrollments')
    .select('id')
    .eq('journey_id', journey.id)
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) return;

  const steps = journey.steps;
  if (!steps || steps.length === 0) return;

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('journey_enrollments')
    .insert({
      journey_id: journey.id,
      business_id: journey.business_id,
      customer_id: customerId,
      current_step: 0,
    })
    .select('id')
    .single();

  if (enrollmentError || !enrollment) return;

  const firstStep = steps[0];
  const sendAt = (firstSendAt ?? snapToSendWindow(new Date(Date.now() + firstStep.wait_hours * 60 * 60 * 1000))).toISOString();

  await supabase.from('messages').insert({
    business_id: journey.business_id,
    customer_id: customerId,
    purpose: firstStep.purpose,
    channel: firstStep.channel,
    journey_enrollment_id: enrollment.id,
    sequence_step: 1,
    send_at: sendAt,
    ...(visitId ? { visit_id: visitId } : {}),
  });
}

/**
 * Called after a step's message is successfully sent. Schedules the next
 * step if one exists, otherwise marks the enrollment completed.
 */
export async function advanceJourneyEnrollment(
  supabase: SupabaseClient<Database>,
  enrollmentId: string
): Promise<void> {
  const { data: enrollment } = await supabase
    .from('journey_enrollments')
    .select('id, journey_id, business_id, customer_id, current_step, status')
    .eq('id', enrollmentId)
    .maybeSingle();

  if (!enrollment || enrollment.status !== 'active') return;

  const { data: journey } = await supabase
    .from('journeys')
    .select('steps')
    .eq('id', enrollment.journey_id)
    .maybeSingle();

  if (!journey) return;

  const nextStepIndex = enrollment.current_step + 1;
  const nextStep = journey.steps[nextStepIndex];

  if (!nextStep) {
    await supabase
      .from('journey_enrollments')
      .update({ status: 'completed' })
      .eq('id', enrollmentId);
    return;
  }

  await supabase
    .from('journey_enrollments')
    .update({ current_step: nextStepIndex })
    .eq('id', enrollmentId);

  // Never schedule the same step twice (e.g. two overlapping cron runs advancing one enrollment).
  const { data: existingStep } = await supabase
    .from('messages')
    .select('id')
    .eq('journey_enrollment_id', enrollmentId)
    .eq('sequence_step', nextStepIndex + 1)
    .neq('status', 'cancelled')
    .limit(1);
  if (existingStep && existingStep.length > 0) return;

  const sendAt = snapToSendWindow(new Date(Date.now() + nextStep.wait_hours * 60 * 60 * 1000)).toISOString();

  await supabase.from('messages').insert({
    business_id: enrollment.business_id,
    customer_id: enrollment.customer_id,
    purpose: nextStep.purpose,
    channel: nextStep.channel,
    journey_enrollment_id: enrollmentId,
    sequence_step: nextStepIndex + 1,
    send_at: sendAt,
  });
}

/**
 * Stop-on-event: called when a customer clicks a review link or submits
 * feedback, so remaining sequence steps don't keep firing after the
 * customer has already engaged. Cancels any still-pending message tied to
 * the enrollment and marks it exited.
 */
export async function exitJourneyEnrollment(
  supabase: SupabaseClient<Database>,
  enrollmentId: string
): Promise<void> {
  await supabase
    .from('messages')
    .update({ status: 'cancelled' })
    .eq('journey_enrollment_id', enrollmentId)
    .eq('status', 'pending');

  await supabase
    .from('journey_enrollments')
    .update({ status: 'exited' })
    .eq('id', enrollmentId);
}
