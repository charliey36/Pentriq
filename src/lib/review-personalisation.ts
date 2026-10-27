/**
 * Everything a review email needs beyond name/links: the business's custom copy
 * and the per-appointment values (service, staff member, date). Shared by the
 * scheduled sender and the manual "send now" path so both render identically.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { formatAppointmentDate } from '@/lib/message-template';

type Db = SupabaseClient<Database>;

export const REMINDERS_OFF_MESSAGE = 'Review reminders are turned off in Settings.';

/** True when this message is a follow-up reminder and the business has switched reminders off. */
export function reminderDisabled(business: { review_reminders_enabled?: boolean | null }, purpose: string): boolean {
  return purpose === 'review_reminder' && business.review_reminders_enabled === false;
}

export type ReviewPersonalisation = {
  customSubject: string | null;
  customBody: string | null;
  serviceName: string | null;
  staffName: string | null;
  appointmentDate: string | null;
};

export async function loadPersonalisation(
  supabase: Db,
  business: { review_message_subject?: string | null; review_message_body?: string | null },
  message: { visit_id: string | null }
): Promise<ReviewPersonalisation> {
  const out: ReviewPersonalisation = {
    customSubject: business.review_message_subject ?? null,
    customBody: business.review_message_body ?? null,
    serviceName: null,
    staffName: null,
    appointmentDate: null,
  };
  if (!message.visit_id) return out;
  try {
    const { data } = await supabase.from('visits').select('visited_at, staff_name, service_id').eq('id', message.visit_id).maybeSingle();
    if (data) {
      if (data.service_id) {
        const { data: service } = await supabase.from('services').select('name').eq('id', data.service_id).maybeSingle();
        out.serviceName = service?.name ?? null;
      }
      out.staffName = data.staff_name ?? null;
      out.appointmentDate = formatAppointmentDate(data.visited_at);
    }
  } catch {
    // Personalisation is optional: fall back to the readable defaults.
  }
  return out;
}
