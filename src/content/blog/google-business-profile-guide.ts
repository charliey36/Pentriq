import type { BlogPost } from '@/lib/blog-types';

export const post: BlogPost = {
  slug: 'google-business-profile-guide',
  featured: true,
  title: 'The Complete Google Business Profile Guide for Small Businesses',
  seoTitle: 'Google Business Profile Guide for Small Business | Pentriq',
  seoDescription:
    'Set up, verify and optimise your Google Business Profile: categories, photos, posts, reviews and fixes for common issues, in one practical guide.',
  ogTitle: 'The Complete Google Business Profile Guide for Small Businesses',
  ogDescription:
    'Everything small businesses need to set up, verify and optimise a Google Business Profile, plus how to fix the most common problems.',
  excerpt:
    'Your Google Business Profile is often the first thing a customer sees. This guide covers setup, verification, optimisation, photos, posts, reviews and the issues that trip businesses up.',
  category: 'Google Business Profile',
  keywords: [
    'google business profile',
    'google business profile guide',
    'set up google business profile',
    'verify google business profile',
    'optimise google business profile',
    'google my business',
  ],
  datePublished: '2026-10-12',
  dateModified: '2026-10-12',
  related: ['how-to-get-more-google-reviews', 'reputation-management-for-small-business'],
  cta: {
    title: 'Turn your Business Profile into a review engine with Pentriq.',
    text: 'Once your profile is set up, Pentriq helps you collect reviews consistently, offers customers a private feedback route, and tracks your review count and rating over time so you can see what is working.',
    label: 'Try Pentriq free for 30 days',
    href: '/signup',
  },
  body: [
    {
      t: 'p',
      text: 'When someone searches for a business like yours on Google or Google Maps, the box that appears with your name, rating, photos, opening hours and a button to call or get directions is your Google Business Profile (formerly known as Google My Business). For many local customers it is the first, and sometimes only, impression of your business they will ever see. They may never visit your website at all.',
    },
    {
      t: 'p',
      text: 'The good news is that a Business Profile is free, and a well-maintained one gives you a real advantage over competitors who set theirs up once and forgot about it. This guide walks through the whole lifecycle: creating the profile, getting verified, optimising it, using photos and posts effectively, managing reviews, and fixing the issues small businesses run into most often. Google changes the interface and some features from time to time, so treat the specifics as a guide and check Google’s current help pages for the latest wording.',
    },

    { t: 'h2', text: 'What a Google Business Profile does for you', id: 'what-it-does' },
    {
      t: 'p',
      text: 'A profile does four things. It makes you eligible to appear in the local pack (the map results shown for searches such as “plumber near me”), it gives customers the essentials in one glance, it gives them ways to contact you with a single tap, and it hosts your reviews. Google has said that local results depend mainly on relevance, distance and prominence. A complete, accurate, active profile improves relevance and prominence, and a steady stream of good reviews helps prominence further, which is why we cover reviews in detail below and in our guide on [how to get more Google reviews](/blog/how-to-get-more-google-reviews).',
    },

    { t: 'h2', text: 'Are you eligible?', id: 'eligibility' },
    {
      t: 'p',
      text: 'Before you create anything, check that your business qualifies. In general, Google expects a business to make in-person contact with customers during stated hours, either at a physical location or by travelling to customers. That covers shops, salons and restaurants, and also service-area businesses such as mobile mechanics, cleaners and tradespeople. Online-only businesses without any in-person interaction generally do not qualify.',
    },
    {
      t: 'ul',
      items: [
        '**Storefront businesses** show a public address that customers can visit.',
        '**Service-area businesses** travel to customers and should hide their home address while listing the areas they serve.',
        '**Hybrid businesses** (for example a shop that also delivers) can show their address and also list a service area.',
      ],
    },
    {
      t: 'p',
      text: 'Avoid using a virtual office, a mailbox service or a co-working address you are not staffed at during your listed hours. Those are a common reason for profiles being suspended.',
    },

    { t: 'h2', text: 'Setting up your profile step by step', id: 'setup' },
    {
      t: 'ol',
      items: [
        '**Sign in with the right Google account.** Use an account you will keep long-term and that more than one trusted person can access if needed. Avoid tying your business to a personal account that could be lost if someone leaves.',
        '**Search for your business first.** If a profile already exists (Google sometimes creates them automatically, or a previous owner made one), you should claim it rather than creating a duplicate. Duplicates split your reviews and can trigger problems later.',
        '**Enter your business name exactly as it appears in the real world.** Use the name on your signage, invoices and website. Do not add keywords, locations or taglines. Names such as “Best Cheap Plumber London 24h” violate Google’s guidelines and often lead to suspension.',
        '**Choose your primary category carefully.** This is one of the most important choices you will make (more on this below).',
        '**Add your address or service area.** Storefronts add a precise address and a map pin; service-area businesses specify towns, postcodes or a radius.',
        '**Add your phone number and website.** Use a number that is answered during your opening hours, and a website page that matches the business.',
        '**Add your opening hours.** Be accurate, including late openings and lunch breaks.',
        '**Complete verification** (see the next section).',
      ],
    },

    { t: 'h2', text: 'Verification explained', id: 'verification' },
    {
      t: 'p',
      text: 'Verification proves to Google that your business is real and that you control the profile. Until a profile is verified, most of its features are limited and it will not perform properly. Google decides which verification options are offered, based on your business type and location.',
    },
    {
      t: 'ul',
      items: [
        '**Postcard.** Google mails a code to the address you entered. It usually takes several days, and the code must be entered before it expires. Make sure someone at the address will open it.',
        '**Phone or text message.** Available for some businesses; a code is sent to the number on the profile.',
        '**Email.** Available for some businesses; a code is sent to an address associated with the profile.',
        '**Video verification.** Increasingly common. You record a continuous video showing your location, signage, equipment and proof that you manage the business, and Google reviews it. Do not cut, edit or pause the recording.',
        '**Instant verification.** If your website is already verified in Google Search Console, you may be verified immediately.',
      ],
    },
    {
      t: 'h3',
      text: 'Tips to avoid verification failures',
    },
    {
      t: 'ul',
      items: [
        'Make sure the name, address and category in your application match what you show in the video and on your signage.',
        'Film in good light, show the street outside and the entrance, and include any vehicles or tools if you are a service-area business.',
        'Do not request multiple codes in quick succession, since each request can invalidate the last.',
        'If verification is rejected, read the reason, fix the discrepancy and resubmit rather than creating a new profile.',
      ],
    },

    { t: 'h2', text: 'Optimising your profile', id: 'optimisation' },
    {
      t: 'p',
      text: 'Once verified, the difference between a basic profile and an excellent one comes down to completeness, accuracy and freshness.',
    },
    {
      t: 'h3',
      text: 'Categories',
    },
    {
      t: 'p',
      text: 'Your primary category tells Google what your business is, and it has more influence on which searches you appear for than almost any other field. Pick the most specific category that honestly describes your main service (for example “Hair salon” rather than just “Beauty”). Then add secondary categories for other services you genuinely provide, but do not pad the list with irrelevant options.',
    },
    {
      t: 'h3',
      text: 'Description, services and attributes',
    },
    {
      t: 'ul',
      items: [
        '**Business description.** You have up to 750 characters, and the first part is most visible. Describe what you do, who you serve and what makes you different, written naturally for humans rather than stuffed with keywords. Do not include links, promotional offers or contact details in the description.',
        '**Services or products.** List your main offerings with short descriptions and, where appropriate, prices. This helps customers qualify themselves before contacting you.',
        '**Attributes.** Mark things like wheelchair accessibility, online appointments, free Wi-Fi or women-led, if they apply. These details appear in your listing and can match specific searches.',
        '**Opening hours, including special hours.** Update hours for bank holidays and any temporary closures. Wrong hours are among the most frustrating things for customers and can lead to poor reviews.',
        '**Website and booking links.** Point customers to the most useful page, such as a booking form rather than just your home page.',
      ],
    },
    {
      t: 'h3',
      text: 'Keep your name, address and phone consistent',
    },
    {
      t: 'p',
      text: 'Your business name, address and phone number (often called NAP) should be identical across your Business Profile, website, social media and directories. Inconsistencies confuse both customers and search engines. Choose one format and use it everywhere.',
    },

    { t: 'h2', text: 'Photos that win customers', id: 'photos' },
    {
      t: 'p',
      text: 'Photos are one of the most visible parts of a profile, and businesses with plenty of real, recent images tend to look more established and trustworthy. Prioritise authenticity over polish: customers are looking for evidence that you are who you say you are.',
    },
    {
      t: 'ul',
      items: [
        '**Logo and cover photo.** The cover is shown prominently, so choose a clear image that represents your business at its best.',
        '**Exterior and entrance.** Help people recognise the building and find the door, particularly if you are hard to spot from the street.',
        '**Interior.** Show the space customers will walk into.',
        '**Team.** Friendly, genuine photos of staff reduce hesitation, especially for services that involve visiting someone’s home.',
        '**Your work.** Before and after shots, finished dishes, completed projects, products: whatever shows the quality customers are paying for.',
      ],
    },
    {
      t: 'p',
      text: 'Use sharp, well-lit images in a common format such as JPG or PNG, and check Google’s current recommendations for size and resolution. Avoid stock photos, heavy filters and images with text overlays, which are not allowed in some placements. Add a few new photos every month rather than uploading everything at once; fresh images signal an active business. Remember that customers can also upload their own photos, so it is worth checking what appears on your profile periodically.',
    },

    { t: 'h2', text: 'Posts and updates', id: 'posts' },
    {
      t: 'p',
      text: 'Google Business Profile posts let you share updates, offers and events directly on your listing. They are a lightweight way to show that your business is active and to promote timely information, such as seasonal services, new products or opening-hours changes.',
    },
    {
      t: 'ul',
      items: [
        'Keep posts short, specific and useful. A clear photo and a one-sentence message is plenty.',
        'Include a call-to-action button, such as “Book”, “Call” or “Learn more”, where available.',
        'Post on a regular rhythm that you can sustain, for example once a week, rather than a flurry followed by months of silence.',
        'Follow Google’s content policies: do not post misleading offers, restricted content or anything unrelated to your business.',
      ],
    },
    {
      t: 'p',
      text: 'Do not expect posts to transform your rankings by themselves. Their value is in persuading people who have already found you, by showing that the business is open, current and engaged.',
    },

    { t: 'h2', text: 'Reviews: the part customers read first', id: 'reviews' },
    {
      t: 'p',
      text: 'Reviews are the most influential element of your profile for most customers, and the one you can least directly control. That makes your process for earning and responding to them especially important.',
    },
    {
      t: 'h3',
      text: 'Earning reviews',
    },
    {
      t: 'p',
      text: 'Ask every happy customer, soon after the experience, with a direct link that works on mobile. Never offer incentives, never filter who you ask based on how they are likely to rate you, and never write reviews yourself. We cover the timing, wording and a 30-day plan in detail in our guide on [how to get more Google reviews](/blog/how-to-get-more-google-reviews).',
    },
    {
      t: 'h3',
      text: 'Responding to reviews',
    },
    {
      t: 'p',
      text: 'Reply to all reviews, positive and negative, in a professional and personal tone. Thank people by name, mention a detail from their experience, and keep replies short. For negative reviews, acknowledge the problem, apologise where appropriate, and offer to resolve it offline without sharing private details. Prospective customers read your replies as much as the reviews themselves. Our [reputation management guide](/blog/reputation-management-for-small-business) includes example replies for good, mixed and critical reviews.',
    },
    {
      t: 'h3',
      text: 'Reporting problem reviews',
    },
    {
      t: 'p',
      text: 'You cannot remove a review just because it is negative. You can flag reviews that violate Google’s policies, such as spam, fake reviews, off-topic content, conflict of interest or offensive language. Report them through your profile and keep evidence, but be patient: removal can take days, and some reports are declined.',
    },

    { t: 'h2', text: 'Common issues and how to fix them', id: 'common-issues' },
    {
      t: 'h3',
      text: 'My profile has been suspended',
    },
    {
      t: 'p',
      text: 'Suspensions are most often caused by a keyword-stuffed business name, an ineligible address such as a virtual office, a mismatch between the profile and the real world, or major unapproved edits. Read the notification, correct the cause, and submit a reinstatement request with supporting evidence such as photos of signage, a business licence or utility bills. Do not create a replacement profile, which usually makes things worse.',
    },
    {
      t: 'h3',
      text: 'There is a duplicate listing',
    },
    {
      t: 'p',
      text: 'Duplicates dilute your reviews and confuse customers. Search for your business name and address, then use the “suggest an edit” or “report a problem” options to mark the duplicate as a duplicate or as closed. If you own both, ask Google to merge them through the support process.',
    },
    {
      t: 'h3',
      text: 'Someone has changed my information',
    },
    {
      t: 'p',
      text: 'Google allows users to suggest edits, and occasionally incorrect changes are accepted. Check your profile regularly and fix anything wrong. You can also enable notifications so that you are alerted to changes.',
    },
    {
      t: 'h3',
      text: 'My profile is not showing up',
    },
    {
      t: 'ul',
      items: [
        'Check it is verified and not marked as closed.',
        'Make sure your primary category matches what people search for.',
        'Confirm that your service area and address are accurate.',
        'Be patient: new profiles and major edits can take time to appear.',
      ],
    },
    {
      t: 'h3',
      text: 'My reviews disappeared',
    },
    {
      t: 'p',
      text: 'Google removes reviews it believes violate its policies, and sometimes filters real reviews incorrectly. Common triggers are reviews from accounts that look suspicious, many reviews posted in a short time from the same location or device, and reviews that appear to have been incentivised. If real customers’ reviews are missing, ask Google Business Profile support, and avoid doing anything that looks like bulk review solicitation.',
    },

    { t: 'h2', text: 'Measuring performance', id: 'performance' },
    {
      t: 'p',
      text: 'Your profile includes performance data showing how customers found you and what they did next: calls, direction requests, website clicks, messages and, depending on availability, the search terms that triggered your listing. Look at this monthly. If you see many views but few actions, your photos, description or reviews may not be persuading people. If actions drop suddenly, check for incorrect hours, a suspended profile or a competitor’s improved listing.',
    },
    {
      t: 'p',
      text: 'Alongside Google’s own data (and [Pentriq’s dashboard](/#features), which also tracks request clicks), track your review count and average rating over time. A slow decline in rating or a long gap since your last review is an early warning that deserves attention. Tools like [Pentriq’s Reviews Analytics](/#features) record review count and rating over time, show rating change compared with the end of last month, and highlight review velocity, so trends are obvious at a glance rather than buried in a spreadsheet.',
    },

    { t: 'h2', text: 'A monthly maintenance checklist', id: 'checklist' },
    {
      t: 'ol',
      items: [
        'Check that your name, address, phone number, website and hours are correct, including upcoming holiday changes.',
        'Upload a few new, real photos.',
        'Publish one or more posts.',
        'Reply to every new review and note any recurring themes.',
        'Review performance data and compare with the previous month.',
        'Search for your business as a customer would and look for duplicates, wrong information or unexpected edits.',
        'Review your review-request process and adjust timing or wording if results have slipped.',
      ],
    },
    {
      t: 'p',
      text: 'A Google Business Profile is not a set-and-forget asset. The businesses that benefit most are those that treat it as a living shop window: accurate, current and full of genuine evidence that customers are happy. Not yet verified? Our [verification guide](/blog/google-business-profile-verification-guide) walks through every method. Spend an hour setting it up properly, ten minutes a week keeping it fresh, and let a consistent review process do the rest. Pentriq’s [single plan](/pricing) is built for exactly that routine, and you can [start a free trial](/signup) to try it.',
    },
  ],
};
