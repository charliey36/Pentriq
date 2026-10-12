import type { BlogPost } from '@/lib/blog-types';
import { callout, example, h2, h3, ol, p, ul } from './_helpers';

export const post: BlogPost = {
  slug: 'google-review-request-templates',
  title: 'Google Review Request Templates That Actually Work',
  seoTitle: 'Google Review Request Templates That Work | Pentriq',
  seoDescription: 'Copy-and-paste Google review request templates for email, SMS, in person and reminders, plus the rules that keep your requests compliant.',
  ogTitle: 'Google Review Request Templates That Actually Work',
  ogDescription: 'Email, SMS, reminder and in-person templates for asking for Google reviews, with tips on timing, tone and compliance.',
  excerpt: 'The wording of a review request changes how many people respond. Use these tested structures for email, text, reminders and in-person asks, and avoid phrases that break the rules.',
  category: 'Google Reviews',
  keywords: ['google review request template', 'review request email template', 'review request sms', 'ask for google review wording', 'review reminder message'],
  datePublished: '2026-10-12',
  dateModified: '2026-10-12',
  related: ['how-to-get-more-google-reviews', 'how-many-google-reviews-does-a-business-need'],
  cta: {
    title: 'Send these requests automatically with Pentriq.',
    text: 'Pentriq sends a branded request, a day-three reminder and a day-seven final reminder, stops the moment a customer responds, and tracks clicks and reviews. See pricing or start your free trial.',
    label: 'Start your free trial',
    href: '/signup',
  },
  body: [
    p('A good review request is short, personal and easy to act on. A bad one is generic, long or awkward, and ends up ignored. The difference in response can be large, and it costs nothing to improve. This post gives you ready-to-use templates for every common situation, explains why each one works, and sets out the compliance rules you must stay inside so your reviews are never at risk of removal.'),
    p('If you want the bigger picture first, including timing, channels and measurement, start with our guide to [getting more Google reviews](/blog/how-to-get-more-google-reviews), then come back here for the wording.'),

    h2('What every strong review request has', 'anatomy'),
    ol('**A personal opening.** Use the customer’s first name and mention the business or the job. “Hi Sam” beats “Dear customer” every time.', '**A thank-you first.** Lead with gratitude, not the ask.', '**A specific, small request.** “Would you mind leaving a short Google review?” is easier to say yes to than “please review us”.', '**A reason.** Explain briefly how reviews help: other people find you and your team learns what is working.', '**One clear link.** One tap from message to review box, tested on a phone.', '**An honest private option.** Offer a way to send feedback privately, to everyone.', '**A sign-off from a person.** A named human or small team feels warmer than a brand.'),
    callout('Keep it compliant', 'Do not offer rewards for reviews, do not ask only customers you think will be positive, do not hide the public link from anyone, and do not ask for a particular star rating. Google prohibits incentivised reviews and selectively soliciting positive ones, and regulators in the US and UK target fake and suppressed reviews.'),

    h2('Email templates', 'email'),
    h3('Template 1: the friendly default'),
    example('Email: after an appointment', 'Subject: How was your visit, {first_name}?', '', 'Hi {first_name},', '', 'Thanks for choosing {business_name} today. It was great to see you.', '', 'If you have a minute, a short Google review would really help other people find us and tells our team what we are doing well:', '[Leave a Google review]', '', 'If you would rather share your thoughts privately, you can do that here: [Send private feedback]', '', 'Thank you,', '{sender_name} and the {business_name} team'),
    h3('Template 2: after a completed job'),
    example('Email: trades and home services', 'Subject: Your {service} at {address_area}', '', 'Hi {first_name},', '', 'Thanks again for letting us look after your {service}. We hope everything is working exactly as it should.', '', 'We are a small local business and reviews are how most of our new customers find us. If you were happy with the work, would you mind leaving a quick review? It only takes a minute:', '[Leave a Google review]', '', 'If anything is not quite right, please tell us directly and we will fix it: [Send private feedback]', '', 'Best wishes,', '{sender_name}'),
    h3('Template 3: for returning customers'),
    example('Email: loyal customer', 'Subject: Could you do us a small favour, {first_name}?', '', 'Hi {first_name},', '', 'You have been coming to {business_name} for a while now, and we really appreciate it. If you have a moment, we would be grateful if you would share your experience in a Google review, so more people can find us:', '[Leave a Google review]', '', 'Thank you for your support,', '{sender_name}'),

    h2('SMS templates', 'sms'),
    p('Text messages need to be brief. Keep to a single message where you can, include your business name so the sender is clear, and always provide a way to opt out. Make sure you hold valid consent to message the customer, because rules vary by country.'),
    example('SMS: standard', 'Hi {first_name}, thanks for visiting {business_name} today! If you have a minute, we would really appreciate a quick Google review: {link}. Reply STOP to opt out.'),
    example('SMS: with private option', 'Hi {first_name}, thanks for choosing {business_name}. Review us on Google: {link}. Prefer to tell us privately? {feedback_link}. Reply STOP to opt out.'),
    p('Pentriq currently sends review requests by email. If you use text messages today, the templates above still apply, and we explain the trade-offs between channels in our [email vs SMS comparison](/blog/how-to-get-more-google-reviews).'),

    h2('Reminder templates', 'reminders'),
    p('A single reminder recovers many customers who meant to respond and forgot. Send the first around day three and a final one around day seven, then stop. Never send a reminder to someone who has already clicked through or left feedback.'),
    example('Day-three reminder', 'Hi {first_name}, just a quick reminder in case you missed our note. If you have a spare minute, your review would mean a lot to our small team: {link}. Thank you!'),
    example('Day-seven final reminder', 'Hi {first_name}, this is our last nudge, we promise! If you were happy with {business_name}, a short Google review helps other people find us: {link}. If now is not a good time, no problem at all, and thank you either way.'),
    p('Pentriq runs exactly this three-step sequence automatically and [stops it as soon as the customer responds](/#how-it-works), so nobody gets a reminder for a review they have already written.'),

    h2('In-person and printed scripts', 'in-person'),
    ul('**At the end of a service:** “I am really glad you are happy with it. We are a small business and reviews make a huge difference. Would you mind if I sent you a link to leave one? It takes about a minute.”', '**On a receipt or card:** “Enjoyed your visit? Scan to leave a quick Google review. Thank you!” with a QR code to your review link.', '**On an invoice:** “Thank you for your business. If you were happy with our work, we would appreciate a Google review: [short link].”', '**By phone:** “Thanks for your time today. I will send you a short message with a link if you would like to share your experience.”'),

    h2('Subject lines and phrases that help or hurt', 'phrases'),
    h3('Helps'),
    ul('“How was your visit, {first_name}?”', '“Could you do us a small favour?”', '“Thanks for choosing {business_name}.”', '“Your feedback helps other people find us.”'),
    h3('Hurts or breaks the rules'),
    ul('“Leave a 5-star review and get 10% off.” This is an incentive and is not allowed.', '“If you were happy, review us on Google. If not, email us.” This is gating, which breaks Google’s policy.', '“Please give us five stars.” Ask for an honest review, not a specific rating.', 'Long paragraphs of text before the link. Most people only read the first two lines.', 'ALL CAPS and multiple exclamation marks, which look like spam and trigger filters.'),

    h2('Adjust tone and wording by business type', 'by-business-type'),
    p('The same structure works everywhere, but the wording should sound like your business. A few starting points follow.'),
    ul('**Salons, barbers and beauty:** warm and informal, mention the stylist or therapist by name, and send the same day. “Hope you love the new look!” is a natural opener.', '**Trades and home services:** practical and reassuring. Confirm the job is complete and working before you ask, and mention the specific work, such as the boiler, the extension or the repair.', '**Clinics, physiotherapy and wellbeing:** gentle and respectful. Avoid asking while someone is still in discomfort, and never include health details in the message itself, since reviews and emails can be seen by others.', '**Restaurants and cafés:** short and cheerful, ideally with a QR code on the bill or table card. Ask the next morning for delivery or booking customers.', '**Professional services:** a little more formal, sent after a clear milestone or outcome, and brief about why a review helps prospective clients choose with confidence.'),
    p('Whatever the sector, read each template aloud before you send it. If it sounds like something you would not say to a customer face to face, rewrite it. Authentic, human wording is the single best predictor of a response, and it is far more persuasive than clever marketing language. Also keep any placeholders clean: a message that begins “Hi {first_name}” because a name field was empty is worse than no message at all, so use a safe fallback such as “Hi there” and check your data before sending.'),

    h2('Test and improve your templates', 'testing'),
    p('Do not guess. Change one thing at a time and compare results over a few weeks.'),
    ul('**Subject line:** compare two versions on equal-sized groups.', '**Send time:** same day versus the next morning.', '**Message length:** short versus slightly longer.', '**Channel:** email versus text for customers where you have both and consent.'),
    p('The numbers that matter are request-to-click rate (clicks ÷ requests) and click-to-review rate (reviews ÷ clicks). A low click rate points to the message or timing; a low review rate after the click points to friction on the page. Pentriq tracks sent requests, filtered clicks and reviews in its [dashboard and analytics](/#features), so you can see which wording works. If you are wondering how many reviews to aim for, read [how many Google reviews a business needs](/blog/how-many-google-reviews-does-a-business-need).'),

    h2('Quick checklist before you send', 'checklist'),
    ol('Does it use the customer’s first name?', 'Does it start with thanks?', 'Is there a single, tested link that works on mobile?', 'Is there an honest private option for everyone?', 'Is there no incentive, no star request and no filtering?', 'Does SMS include an opt-out?', 'Will the sequence stop once the customer responds?'),
    p('Great templates are only half of the system. The other half is asking consistently, at the right moment, and measuring what happens. If you would like all of that handled for you, see Pentriq’s [simple pricing](/pricing) and [start a free trial](/signup). To handle the occasional unhappy response gracefully, read how to [respond to negative Google reviews](/blog/how-to-respond-to-negative-google-reviews).'),
  ],
};
