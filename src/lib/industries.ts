/**
 * Industry playbooks. One source of truth for (a) the /for/<industry> sales pages and
 * (b) onboarding presets that pre-fill the service catalogue with sensible rebooking intervals.
 *
 * Intervals are typical rules of thumb, always editable in Settings -> Services, and the pages say so.
 * No statistics or testimonials live here on purpose: only copy that is true by construction.
 */
export type IndustryService = { name: string; intervalDays: number };

export type Industry = {
  slug: string;
  /** Plural, display form: "Hair salons". */
  plural: string;
  /** Singular noun used in sentences: "salon". */
  noun: string;
  headline: string;
  intro: string;
  pains: [string, string, string];
  services: IndustryService[];
  /** A natural review-request message for this trade (shown as an example on the page). */
  sampleAsk: string;
  rebookingIdea: string;
  faq: [string, string][];
};

export const INDUSTRIES: Industry[] = [
  {
    slug: 'hair-salons', plural: 'Hair salons', noun: 'salon',
    headline: 'More Google reviews and fuller diaries for hair salons',
    intro: 'Clients love their stylist but rarely think to leave a review, and a colour client who drifts away for twelve weeks is lost income. Pentriq asks at the right moment and brings clients back at the right time.',
    pains: ['Happy clients leave without ever being asked for a review.', 'Colour and cut clients lapse and nobody notices until they are gone.', 'Reception is too busy to chase follow-ups by hand.'],
    services: [{ name: 'Cut and finish', intervalDays: 42 }, { name: 'Colour', intervalDays: 56 }, { name: 'Highlights', intervalDays: 70 }, { name: 'Blow dry', intervalDays: 14 }],
    sampleAsk: 'Hi Sam, thanks for visiting us today. If you loved your new look, a quick Google review would mean a lot to our small team.',
    rebookingIdea: 'Nudge colour clients around week 7 so they rebook before their roots show.',
    faq: [['How does a salon get its first 50 Google reviews?', 'Ask every client, every time, within a day of the appointment. Pentriq automates the ask and two gentle reminders so no happy client is missed.'], ['Can I import clients from my booking system?', 'Yes. Import a CSV, or connect Square, Acuity or Calendly so new appointments flow in automatically.']],
  },
  {
    slug: 'barbers', plural: 'Barbers', noun: 'barbershop',
    headline: 'Turn regulars into reviews, and keep the chair full',
    intro: 'Barbers run on repeat custom. Pentriq makes asking for a review automatic and reminds clients when they are due their next cut.',
    pains: ['Walk-in culture means no follow-up with customers.', 'New barbershops nearby compete on star ratings.', 'Regulars drift to a different shop after one missed week.'],
    services: [{ name: 'Haircut', intervalDays: 28 }, { name: 'Haircut and beard trim', intervalDays: 28 }, { name: 'Skin fade', intervalDays: 21 }, { name: 'Beard trim', intervalDays: 21 }],
    sampleAsk: 'Cheers for coming in today! If you are happy with the cut, we would really appreciate a quick Google review.',
    rebookingIdea: 'Remind clients at the four-week mark, just when the fade starts to grow out.',
    faq: [['Do I need appointments for this to work?', 'No. Add a customer with their email or phone after the cut and Pentriq handles the ask.'], ['Will it spam my regulars?', 'No. Frequency limits and a review cooldown stop repeat asks, and everyone can opt out in one click.']],
  },
  {
    slug: 'beauty-salons', plural: 'Beauty salons and therapists', noun: 'salon',
    headline: 'Build trust online with more reviews from happy clients',
    intro: 'Beauty clients choose on reviews and photos. Pentriq collects the reviews and brings clients back for their next treatment.',
    pains: ['New clients check reviews before booking.', 'Course treatments like lashes and nails need timely rebooking.', 'Private complaints never reach you and show up as one-star reviews instead.'],
    services: [{ name: 'Lash infills', intervalDays: 21 }, { name: 'Gel nails', intervalDays: 21 }, { name: 'Facial', intervalDays: 35 }, { name: 'Waxing', intervalDays: 35 }, { name: 'Massage', intervalDays: 42 }],
    sampleAsk: 'Thank you for visiting us. If you enjoyed your treatment, we would be so grateful for a short Google review.',
    rebookingIdea: 'Send a rebooking reminder at the three-week mark for lashes and nails.',
    faq: [['What if a client is unhappy?', 'Every request also offers a private feedback option, so you hear concerns first. It is shown to everyone, never used to hide the public review link.'], ['Can clients rebook from the reminder?', 'Yes. Reminders link to your booking page.']],
  },
  {
    slug: 'dentists', plural: 'Dental practices', noun: 'practice',
    headline: 'Reviews and recall reminders for dental practices',
    intro: 'Patients trust a practice others recommend, and recall appointments are the backbone of revenue. Pentriq automates both, with consent and unsubscribe built in.',
    pains: ['Recall lists are managed by hand and patients slip through.', 'Few patients review a practice unless asked.', 'Staff time is better spent with patients than chasing emails.'],
    services: [{ name: 'Check-up', intervalDays: 180 }, { name: 'Hygiene appointment', intervalDays: 180 }, { name: 'Whitening', intervalDays: 365 }],
    sampleAsk: 'Thank you for visiting the practice today. If you were happy with your care, a Google review helps other patients find us.',
    rebookingIdea: 'Remind patients about six months after their last check-up.',
    faq: [['Is this suitable for healthcare?', 'Pentriq stores contact details and visit dates, not clinical information. Do not enter clinical notes. Check your own regulatory obligations on patient communications.'], ['Does it follow GDPR and email rules?', 'It records consent, includes unsubscribe links, and supports data export and deletion.']],
  },
  {
    slug: 'physiotherapists', plural: 'Physiotherapists and clinics', noun: 'clinic',
    headline: 'More reviews and fewer missed follow-ups for physio clinics',
    intro: 'Patients often stop treatment early once the pain eases. Pentriq asks for reviews after a good outcome and gently prompts follow-up and maintenance sessions.',
    pains: ['Reviews drive local search visibility for clinics.', 'Patients drop out before treatment is finished.', 'Past patients are a missed source of repeat work.'],
    services: [{ name: 'Initial assessment', intervalDays: 0 }, { name: 'Follow-up session', intervalDays: 14 }, { name: 'Sports massage', intervalDays: 28 }],
    sampleAsk: 'We hope your session helped. If you have a minute, a Google review would help others find the right care.',
    rebookingIdea: 'Invite past patients back for a maintenance session after a few months.',
    faq: [['Can I use my own wording?', 'Yes. Review messages are customisable and previewed before sending.'], ['Where do private comments go?', 'To your feedback inbox, where you can reply and mark them resolved.']],
  },
  {
    slug: 'vets', plural: 'Veterinary practices', noun: 'practice',
    headline: 'Reviews and vaccination reminders for vets',
    intro: 'Pet owners are loyal and vocal. Pentriq captures their praise as Google reviews and reminds them when vaccinations and check-ups are due.',
    pains: ['Annual boosters get forgotten.', 'Owners rarely review unless asked.', 'Admin time competes with patient care.'],
    services: [{ name: 'Annual vaccination', intervalDays: 365 }, { name: 'Health check', intervalDays: 365 }, { name: 'Dental check', intervalDays: 365 }, { name: 'Nail clip', intervalDays: 60 }],
    sampleAsk: 'Thank you for trusting us with your pet. If you were happy with their visit, a Google review would mean the world.',
    rebookingIdea: 'Send a booster reminder a few weeks before the annual due date.',
    faq: [['Does it work per pet?', 'Pentriq tracks customers (owners) and their services. Put the pet name in the visit notes or service name.'], ['Can I send reminders by SMS?', 'SMS is available once SMS credentials are configured for your account.']],
  },
  {
    slug: 'garages', plural: 'Garages and MOT centres', noun: 'garage',
    headline: 'Reviews and service reminders for garages',
    intro: 'Drivers choose a garage on trust. Pentriq asks for the review after a job well done and reminds them when the MOT or service is due.',
    pains: ['Customers forget their annual MOT and service.', 'A few unhappy reviews outweigh quiet satisfied customers.', 'Follow-up is not part of the job sheet.'],
    services: [{ name: 'MOT', intervalDays: 365 }, { name: 'Full service', intervalDays: 365 }, { name: 'Interim service', intervalDays: 180 }, { name: 'Tyres', intervalDays: 365 }],
    sampleAsk: 'Thanks for choosing us for your car. If you were happy with the work, a Google review helps other drivers find an honest garage.',
    rebookingIdea: 'Remind customers about a month before their MOT is due.',
    faq: [['Can I import jobs from my workshop software?', 'Export a CSV and import it, or use the API endpoint to push completed jobs automatically.'], ['What about complaints?', 'Private feedback lands in your inbox so you can put things right first.']],
  },
  {
    slug: 'heating-engineers', plural: 'Plumbers and heating engineers', noun: 'business',
    headline: 'Reviews and annual boiler service reminders for heating engineers',
    intro: 'Tradespeople win work on reviews. Pentriq asks every finished job for one and reminds customers when their annual service is due.',
    pains: ['Jobs finish and the customer is never heard from again.', 'Annual servicing is repeat revenue that is easy to forget.', 'You are on site, not at a desk.'],
    services: [{ name: 'Boiler service', intervalDays: 365 }, { name: 'Landlord gas safety check', intervalDays: 365 }, { name: 'Repair or call-out', intervalDays: 0 }],
    sampleAsk: 'Thanks for choosing us today. If you were happy with the job, a quick Google review really helps a small local business.',
    rebookingIdea: 'Remind customers a month before their boiler service anniversary.',
    faq: [['Can I add customers from my phone?', 'Yes. The app works on a phone browser, and the integration API can add completed jobs automatically.'], ['Does it work for one-off jobs?', 'Yes. The review request works for any job; reminders apply only to services with a rebooking interval.']],
  },
  {
    slug: 'dog-groomers', plural: 'Dog groomers', noun: 'grooming business',
    headline: 'Keep the grooming diary full and the reviews coming',
    intro: 'Dogs need grooming on a schedule. Pentriq reminds owners at the right interval and asks happy owners for a review.',
    pains: ['Owners forget the next groom until the coat is matted.', 'Local search is decided by reviews.', 'No-one has time to send follow-ups.'],
    services: [{ name: 'Full groom', intervalDays: 56 }, { name: 'Bath and brush', intervalDays: 35 }, { name: 'Puppy introduction', intervalDays: 28 }],
    sampleAsk: 'Thank you for bringing in your pup today. If you were happy with the groom, a Google review would be wonderful.',
    rebookingIdea: 'Remind owners at week seven for full grooms.',
    faq: [['Can I record the dog’s name?', 'Yes. Add it to the visit notes or service name so it appears on the customer record.'], ['Is there a minimum number of customers?', 'No. Pentriq works from the first customer.']],
  },
  {
    slug: 'personal-trainers', plural: 'Personal trainers and studios', noun: 'studio',
    headline: 'Social proof and client retention for trainers and studios',
    intro: 'Results sell training. Pentriq turns happy clients into reviews and spots members who have gone quiet before they cancel.',
    pains: ['Clients drift away after a few weeks.', 'New clients want social proof first.', 'Check-ins are manual and inconsistent.'],
    services: [{ name: '1-to-1 session', intervalDays: 7 }, { name: 'Small group class', intervalDays: 7 }, { name: 'Programme review', intervalDays: 28 }],
    sampleAsk: 'Great work this month! If you have enjoyed training with us, a Google review would really help us reach more people.',
    rebookingIdea: 'Use segments to find clients with no session in 21 days and send a win-back message.',
    faq: [['Can I find clients who have gone quiet?', 'Yes. Segments filter by days since last visit, spend and tags.'], ['Does it replace my booking software?', 'No. It works alongside it; connect Square, Acuity or Calendly, or import a CSV.']],
  },
];

export const industryBySlug = (slug: string) => INDUSTRIES.find((i) => i.slug === slug);

/** Services to pre-fill during onboarding. `intervalDays: 0` means one-off (no rebooking reminder). */
export function presetServices(slug: string | null | undefined): Array<{ name: string; recurrence_interval_days: number | null }> {
  const industry = slug ? industryBySlug(slug) : undefined;
  return (industry?.services ?? []).map((s) => ({ name: s.name, recurrence_interval_days: s.intervalDays > 0 ? s.intervalDays : null }));
}
