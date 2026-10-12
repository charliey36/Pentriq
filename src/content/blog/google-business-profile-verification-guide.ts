import type { BlogPost } from '@/lib/blog-types';
import { callout, h2, h3, ol, p, ul } from './_helpers';

export const post: BlogPost = {
  slug: 'google-business-profile-verification-guide',
  title: 'Google Business Profile Verification Guide: Methods, Tips and Fixes',
  seoTitle: 'Google Business Profile Verification Guide | Pentriq',
  seoDescription: 'How to verify your Google Business Profile: postcard, phone, email and video methods, what to prepare, why verification fails and how to fix it.',
  ogTitle: 'Google Business Profile Verification Guide: Methods, Tips and Fixes',
  ogDescription: 'A practical guide to verifying a Google Business Profile, including video verification, common failures and what to do next.',
  excerpt: 'Until your Google Business Profile is verified, it cannot perform properly. Here is how each verification method works, how to prepare, and how to fix a failed or stuck verification.',
  category: 'Google Business Profile',
  keywords: ['verify google business profile', 'google business profile verification', 'google business video verification', 'verification postcard', 'google business profile not verified'],
  datePublished: '2026-10-12',
  dateModified: '2026-10-12',
  related: ['google-business-profile-guide', 'how-to-get-more-google-reviews'],
  cta: {
    title: 'Verified? Start collecting reviews with Pentriq.',
    text: 'Once your profile is live, Pentriq helps you ask every customer for a review at the right moment and tracks your review count and rating over time. Check the pricing or start your free trial.',
    label: 'Start your free trial',
    href: '/signup',
  },
  body: [
    p('Verification is the step that proves to Google your business is real and that you are entitled to manage its listing. Until it is complete, your Google Business Profile has limited visibility and most of its features are restricted, which means the work you put into photos, services and reviews will not pay off. It is also the step that frustrates the most business owners, because the options offered vary, the process can be slow, and failures are often vague.'),
    p('This guide explains each verification method, how to prepare, the most common reasons verification fails and how to fix them. It is a companion to our broader [Google Business Profile guide](/blog/google-business-profile-guide). Google changes its processes from time to time, so treat the details as a practical guide and confirm the latest steps in Google’s own help pages.'),

    h2('Why verification matters', 'why'),
    ul('**Visibility.** Unverified profiles generally do not appear properly in local results or on Maps.', '**Control.** Verification gives you the ability to edit information, add photos and respond to reviews.', '**Trust.** It shows customers that the listing is genuine and managed by the business.', '**Reviews.** You cannot reply to reviews or benefit fully from your review-collection efforts until the profile is live. See [how to get more Google reviews](/blog/how-to-get-more-google-reviews) once you are verified.'),

    h2('Before you start: get your details right', 'prepare'),
    p('Most failed verifications come from inconsistent details. Spend ten minutes checking the following before you apply.'),
    ul('**Business name.** It must match your real-world signage, website and invoices exactly. Do not add keywords, locations or slogans.', '**Address.** It must be a place where you can meet customers in person or from which you serve them. Do not use a virtual office, a mailbox service, or a co-working space where you are not staffed during your stated hours.', '**Service-area businesses.** If you travel to customers, hide your home address and list the areas you serve.', '**Category.** Choose the most accurate primary category for your main service.', '**Contact details.** Use a phone number you can answer and a website that clearly shows the business.', '**Access.** Make sure someone can receive post at the address and that you are signed in with the Google account you intend to keep long term.'),
    callout('Do not create duplicates', 'Search for your business first. If a profile already exists, claim it instead of creating a new one. Duplicate listings split your reviews and can trigger problems during verification.'),

    h2('Verification methods explained', 'methods'),
    p('Google decides which options it shows you, based on your business type, location and risk signals. You may see one method or several.'),
    h3('Postcard'),
    p('Google posts a card with a verification code to your business address. It typically takes several days to arrive, sometimes longer. Enter the code in your profile before it expires. Do not change your name, address or category while you wait, since that can invalidate the code. Make sure whoever opens the post knows what the card is and keeps it safe.'),
    h3('Phone or text message'),
    p('Offered to some businesses. Google sends a code by call or SMS to the number on the profile. You need to be able to answer that number at the time. If your number is a landline, choose the call option rather than text.'),
    h3('Email'),
    p('Offered to some businesses. A code is sent to an email address associated with the listing. Check spam and junk folders if it does not appear.'),
    h3('Video verification'),
    p('This is increasingly the default. You record a continuous video, usually from a phone, showing proof that the business exists and that you operate it. Google reviews the video and notifies you of the decision. Guidance generally asks you to show:'),
    ul('The street or approach and the exterior of the premises, including signage.', 'The entrance and interior areas where you serve customers.', 'Business equipment, stock or tools, and branded items such as uniforms or vehicles.', 'Evidence that you manage the business, for example a business licence, utility bill or business email access, as Google requests.', 'For service-area businesses, your vehicle, equipment and any branded materials.'),
    p('Record in one continuous take without cuts or edits, in good light, and say clearly who you are and what the business does if prompted. Keep the video steady so details are visible.'),
    h3('Instant verification'),
    p('If you have already verified your website in Google Search Console with the same Google account, you may be verified immediately. This is one reason to set up Search Console early.'),

    h2('Step-by-step: verify your profile', 'steps'),
    ol('Sign in to the Google account you want to manage the profile with.', 'Open your Business Profile and select the option to get verified.', 'Check that the name, address, category and contact details are accurate and match your real-world details.', 'Choose from the verification options you are offered.', 'Complete the steps. For a postcard, wait for it to arrive and enter the code. For video, record and submit as instructed.', 'Wait for Google’s confirmation. Do not make major edits while verification is pending.', 'Once verified, finish your profile: hours, services, photos and description.'),

    h2('Why verification fails and how to fix it', 'failures'),
    h3('The postcard never arrives'),
    ul('Wait at least two weeks before requesting another, since new requests can invalidate older codes.', 'Check the address is correct and that suite or unit numbers are included.', 'Ask neighbours or the building manager whether post has been misdelivered.', 'If you still have nothing, request a new code or choose another method if offered.'),
    h3('Video verification is rejected'),
    ul('Read the reason given and address it directly.', 'Re-record showing the exterior signage, entrance and equipment more clearly.', 'Make sure the video is a single continuous shot with no cuts.', 'Ensure the details in the video match the profile exactly.', 'If your premises are a shared space, show clearly which part is yours and that you are staffed there.'),
    h3('The code is not accepted'),
    ul('Check you are entering it in the correct profile and that it has not expired.', 'Make sure you have not requested a newer code, which cancels the older one.', 'Avoid editing the profile’s core details between requesting and entering the code.'),
    h3('No verification option is shown'),
    ul('Check the profile is not suspended and that the business qualifies.', 'Confirm the address and category are valid for an in-person business.', 'Wait a day or two and try again; options can change.', 'Contact Google Business Profile support if the issue persists.'),
    h3('The profile was suspended during verification'),
    p('Suspensions often follow a keyword-stuffed name, an ineligible address or large unapproved edits. Fix the cause, gather proof of the business such as photos of signage, licences and bills, and submit a reinstatement request. Do not create a replacement profile.'),

    h2('Special cases: moving, rebranding and multiple locations', 'special-cases'),
    p('Verification does not always end after the first time. Some changes to a business can trigger a fresh round, and planning for them avoids downtime.'),
    ul('**Moving premises.** Update the address as soon as you move and expect to re-verify. Until you do, customers may be sent to the wrong place and your reviews can look out of date. Keep your old address visible in the profile description for a short time if you are worried about confusion.', '**Changing your name or rebranding.** Only change the profile name when your signage, website and invoices already show the new name. A mismatch between the profile and the real world is one of the most common reasons for suspension.', '**Changing category or business type.** Substantial changes can prompt Google to ask for verification again, so make them deliberately rather than experimenting.', '**Several locations.** Each location needs its own profile with its own verification, and each should have a distinct address and phone number. Bulk verification may be available for businesses with many locations, subject to Google’s eligibility rules.', '**Transferring ownership.** If you buy a business or hand over a profile, add the new owner as a primary owner before removing yourself, and keep a record of the change. Verification can be requested again if control is unclear.'),
    p('In every case the principle is the same: make the real world and your profile agree, keep evidence such as photos of signage, licences and bills, and never try to work around the process with fake addresses or invented details. A short delay is far cheaper than a suspension.'),

    h2('What to do straight after verification', 'after'),
    ul('Add accurate opening hours, including special hours for holidays.', 'List your services and write a clear description.', 'Upload real photos of your exterior, interior, team and work.', 'Set a direct review link and make sure it works on a mobile device.', 'Start a consistent review-request routine, and respond to every review.'),
    p('Reviews make a verified profile persuasive. Pentriq sends review requests with automatic reminders, offers a private feedback option on every request and tracks clicks and results in its [analytics](/#features). You can see the single plan on the [pricing page](/pricing) or [start a free trial](/signup). For templates you can use today, see our [Google review request templates](/blog/google-review-request-templates).'),

    h2('Keep your profile verified and healthy', 'maintenance'),
    ul('Log in regularly and respond to any notifications from Google.', 'Keep your information consistent across your website, social media and directories.', 'If you move, change name or change category, update the profile promptly and be prepared for re-verification.', 'Add a second owner or manager so access is not tied to one person.', 'Never use fake addresses, keyword-stuffed names or fake reviews.'),
    p('Verification can feel like bureaucracy, but treat it as the foundation. A correctly set up, verified profile will serve you for years, and everything you do afterwards, from photos to reviews, depends on it.'),
  ],
};
