import type { BlogPost } from '@/lib/blog-types';

export const post: BlogPost = {
  slug: 'reputation-management-for-small-business',
  featured: true,
  title: 'Reputation Management for Small Businesses: A Practical Guide',
  seoTitle: 'Reputation Management for Small Business | Pentriq',
  seoDescription:
    'A practical reputation management guide for small businesses: monitor reviews, respond well, collect feedback, use analytics and build a long-term strategy.',
  ogTitle: 'Reputation Management for Small Businesses: A Practical Guide',
  ogDescription:
    'How to monitor reviews, reply to good and bad feedback, collect honest customer input and measure your reputation over the long term.',
  excerpt:
    'Reputation is built in thousands of small moments and recorded in public. This guide shows small businesses how to monitor, respond, collect feedback and measure it all without a big budget.',
  category: 'Reputation Management',
  keywords: [
    'reputation management for small business',
    'online reputation management',
    'respond to negative reviews',
    'monitor online reviews',
    'customer feedback',
    'review analytics',
  ],
  datePublished: '2026-10-12',
  dateModified: '2026-10-12',
  related: ['how-to-get-more-google-reviews', 'google-business-profile-guide'],
  cta: {
    title: 'Monitor, collect and analyse your reputation in one place with Pentriq.',
    text: 'Pentriq combines review requests, a private feedback inbox, and review analytics so you can hear from customers early, respond quickly, and see how your reputation is trending. Try it free for 14 days.',
    label: 'Start your free trial',
    href: '/signup',
  },
  body: [
    {
      t: 'p',
      text: 'Every business has a reputation, whether or not it manages it. It lives in the reviews on Google, the comments on social media, the recommendations customers make to friends, and the things people say when you are not in the room. For a small business, where each customer relationship matters and there is no marketing department to smooth over mistakes, reputation is not a vanity project. It is a core asset that quietly determines how many enquiries you receive and how much you can charge.',
    },
    {
      t: 'p',
      text: 'Reputation management sounds like a corporate discipline, but for a small business it comes down to five repeatable habits: watch what people are saying, respond well, collect feedback deliberately, measure the trends, and fix the underlying causes. This guide covers each one in practical terms, with examples you can adapt.',
    },

    { t: 'h2', text: 'Why reputation matters more than ever', id: 'why-it-matters' },
    {
      t: 'p',
      text: 'Before spending money, a customer will usually check what other people say about you. They look at your rating, read a few reviews, and notice whether you have replied. This happens in seconds and often decides whether you are contacted or skipped. Three things follow from that.',
    },
    {
      t: 'ul',
      items: [
        '**Reputation influences discovery.** Search engines and map apps treat review quantity, quality and freshness as signals when deciding which local businesses to show. See our [Google Business Profile guide](/blog/google-business-profile-guide) for how this connects to your listing.',
        '**Reputation influences conversion.** Two businesses with identical services and prices will convert very differently if one has a 4.8 rating with recent, detailed reviews and the other has few or old reviews.',
        '**Reputation influences pricing.** Trust lets you resist racing to the bottom on price. Customers pay more for confidence.',
      ],
    },
    {
      t: 'p',
      text: 'The flip side is that one unanswered, aggressive review can sit at the top of your profile for months. Good reputation management is partly offence (generating positive evidence) and partly defence (making sure problems are handled quickly and visibly).',
    },

    { t: 'h2', text: 'Where your reputation lives', id: 'where-reputation-lives' },
    {
      t: 'p',
      text: 'Start by listing every place customers might talk about you. Most small businesses need to watch only a handful.',
    },
    {
      t: 'ul',
      items: [
        '**Google reviews.** For most local businesses this is the most important source by a distance.',
        '**Social media.** Facebook reviews and recommendations, Instagram comments and tags, and community groups where people ask for suggestions.',
        '**Industry directories.** Trade bodies, booking platforms, and sector-specific review sites relevant to your field.',
        '**Your own channels.** Emails, contact forms and the replies customers send to your messages.',
        '**Word of mouth.** The hardest to track, but your private feedback and repeat-customer rate will hint at it.',
      ],
    },
    {
      t: 'p',
      text: 'Pick the two or three sources that matter most to your customers and commit to monitoring those well, instead of spreading thin across ten.',
    },

    { t: 'h2', text: 'Monitoring reviews without it taking over your week', id: 'monitoring' },
    {
      t: 'p',
      text: 'Monitoring has two components: noticing new feedback quickly, and spotting patterns over time. For a small team, simple and regular beats sophisticated and sporadic.',
    },
    {
      t: 'ul',
      items: [
        '**Turn on notifications.** Enable email notifications for new Google reviews and for activity on your social pages so nothing sits unnoticed for weeks.',
        '**Set a fixed time.** Put ten minutes in your calendar each weekday morning or at minimum twice a week to check and reply.',
        '**Assign an owner.** One named person is responsible for reviews, with a deputy for holidays. Shared responsibility usually means no responsibility.',
        '**Track the numbers monthly.** Record your review count and average rating on a set date so you can compare month to month.',
      ],
    },
    {
      t: 'p',
      text: 'It is the trend line that tells you the most. A rating that slips from 4.7 to 4.5 over three months is a signal to investigate, long before the average looks alarming. [Pentriq’s Reviews Analytics](/#features) keeps this history for you: review count and rating over time, the change since the end of last month, and in-app alerts for things like new one-star reviews or an average rating that falls below your chosen threshold.',
    },

    { t: 'h2', text: 'Responding to reviews', id: 'responding' },
    {
      t: 'p',
      text: 'Your replies are public, permanent and read by every prospective customer who looks at your reviews. A thoughtful response to criticism can win more trust than a string of five-star ratings. The principles are the same for every review: reply promptly (ideally within a day or two), be personal, be brief, and never be defensive.',
    },
    {
      t: 'h3',
      text: 'Responding to positive reviews',
    },
    {
      t: 'p',
      text: 'Do not just copy-paste “Thanks for your review!” Use the customer’s name, mention something specific they said, and invite them back. It shows real people read the feedback and reinforces what you do well.',
    },
    {
      t: 'example',
      title: 'Reply to a positive review',
      lines: [
        'Hi Priya, thank you so much for the kind words! We’re really glad the new boiler is working well and that Tom was able to fit it in a single day. We’ll be in touch about your annual service next spring. The team at Northside Heating.',
      ],
    },
    {
      t: 'h3',
      text: 'Responding to mixed or neutral reviews',
    },
    {
      t: 'p',
      text: 'Three-star reviews are an opportunity. Thank them, acknowledge what went well, address the specific shortfall, and explain what you will do about it.',
    },
    {
      t: 'example',
      title: 'Reply to a mixed review',
      lines: [
        'Hi Marcus, thank you for the honest feedback. We’re pleased you liked the result, but sorry the appointment started 25 minutes late. We’ve changed how we schedule back-to-back bookings to avoid this. We’d love to welcome you back and make it right.',
      ],
    },
    {
      t: 'h3',
      text: 'Responding to negative reviews',
    },
    {
      t: 'ol',
      items: [
        '**Pause before you reply.** Never respond while angry. Write a draft, wait, and reread it.',
        '**Apologise for the experience.** You can regret how someone felt without admitting liability for facts you dispute.',
        '**Be specific and factual, not defensive.** Avoid arguing point by point in public.',
        '**Do not share private details.** Do not reveal names, bookings or personal information about the customer.',
        '**Offer to fix it offline.** Give a direct contact route and, if appropriate, a named person.',
        '**Keep it short.** Three or four sentences is enough.',
        '**Follow up.** If the issue is resolved, you can politely invite the customer to update their review. Never pressure them to remove it.',
      ],
    },
    {
      t: 'example',
      title: 'Reply to a negative review',
      lines: [
        'Hi Dana, we’re very sorry your order arrived damaged. That’s not the standard we aim for. We’d like to put this right straight away: please email our manager, Sam, at the address on our profile, quoting your order date, and we’ll arrange a replacement or refund. Thank you for letting us know.',
      ],
    },
    {
      t: 'h3',
      text: 'What about unfair or fake reviews?',
    },
    {
      t: 'p',
      text: 'If a review is clearly fake, spam, from a competitor, or violates the platform’s policy, flag it through the platform and keep evidence such as booking records showing no matching customer. Reply calmly in the meantime so that readers can see you are professional: “We can’t find a record of this visit, please contact us so we can look into it.” Do not threaten the reviewer, and do not post fake replies or reviews of your own. Review manipulation is against platform rules and, in many places, against consumer law.',
    },

    { t: 'h2', text: 'Collecting feedback deliberately', id: 'feedback' },
    {
      t: 'p',
      text: 'Relying on whoever happens to post a review gives you a skewed picture: the delighted and the furious are over-represented, and the quietly satisfied or mildly disappointed majority say nothing. A deliberate feedback process fixes that, and it has two parts that work together.',
    },
    {
      t: 'h3',
      text: 'Ask for public reviews, consistently',
    },
    {
      t: 'p',
      text: 'Make it a standard step after every job or visit to send a polite request with a direct link and a short reminder sequence. The mechanics, timing and example wording are in our guide on [how to get more Google reviews](/blog/how-to-get-more-google-reviews).',
    },
    {
      t: 'h3',
      text: 'Offer a private feedback route as well',
    },
    {
      t: 'p',
      text: 'Some customers would rather tell you directly than post publicly, and that is a gift: it lets you fix problems before they become public reviews. The crucial rule is that a private channel must be offered to everyone alongside the public link, and never used to filter who sees the public option. Sending only your happy customers to Google, and hiding the public link from the rest, is review gating, which breaks Google’s policy and runs against consumer-protection rules in several jurisdictions.',
    },
    {
      t: 'p',
      text: 'Pentriq’s requests are built around this rule. Every request includes the public review link and a private feedback option, and private feedback lands in a feedback inbox where you can mark items as acknowledged or resolved. It turns complaints into a to-do list instead of a surprise.',
    },
    {
      t: 'h3',
      text: 'Ask better questions',
    },
    {
      t: 'ul',
      items: [
        'Keep any survey to two or three questions. Long forms get abandoned.',
        'Ask open questions such as “What is one thing we could have done better?” alongside any rating.',
        'Close the loop: tell people what you changed because of their feedback. It encourages them to speak up again.',
      ],
    },

    { t: 'h2', text: 'Using analytics to see what is really happening', id: 'analytics' },
    {
      t: 'p',
      text: 'Reading individual reviews helps you react. Analytics helps you steer. A small set of numbers, tracked consistently, tells you whether your reputation is strengthening or eroding.',
    },
    {
      t: 'ul',
      items: [
        '**Average rating and rating change.** Compare the current average to last month’s. Small drops matter.',
        '**Review count and velocity.** How many new reviews per month, compared with previous months. A business with a good rating but no recent reviews looks stale.',
        '**Request funnel.** Requests sent, link clicks and reviews received. This shows whether the problem is reach, persuasion or friction.',
        '**Response rate and time.** What share of reviews you answer, and how fast.',
        '**Themes in feedback.** Tag recurring topics such as waiting times, pricing, communication or cleanliness. Three mentions of the same issue is a pattern, not a coincidence.',
        '**Private feedback volume.** A rise in private complaints is an early warning, usually weeks before it shows up in public ratings.',
      ],
    },
    {
      t: 'p',
      text: 'You can assemble these in a spreadsheet, but it takes discipline. [Pentriq](/) brings click tracking, a request-to-review funnel, review growth and rating change into one dashboard, so you spend your time acting on the data instead of collecting it. You can [try it free for 14 days](/signup). See the [feature overview](/#features) for what is included, and the [pricing](/pricing) for the single plan.',
    },

    { t: 'h2', text: 'Building a long-term reputation strategy', id: 'long-term-strategy' },
    {
      t: 'p',
      text: 'Tactics such as replying quickly and asking for reviews help, but the businesses with consistently strong reputations share a deeper habit: they treat feedback as operating information and fix the causes, not the symptoms.',
    },
    {
      t: 'ol',
      items: [
        '**Fix the root cause.** If three reviews mention long waits, replying politely to each is not enough. Change the scheduling, staffing or communication that created the wait.',
        '**Systemise the good moments.** Build review requests into your normal workflow so they happen automatically, not only when someone remembers.',
        '**Train your team.** Make sure staff know how reviews are handled, what to say when a customer is unhappy in person, and how to escalate. The best time to prevent a bad review is before the customer leaves.',
        '**Review quarterly.** Once a quarter, look at the trend, themes and response times, choose one improvement, and assign an owner.',
        '**Protect your profiles.** Keep your Business Profile accurate and complete, secure access with shared ownership, and watch for unauthorised changes.',
        '**Stay compliant.** Never incentivise, gate or fabricate reviews. The short-term gain is never worth the loss of credibility or a suspended listing.',
        '**Be patient.** Reputation compounds. Months of consistent behaviour produce a profile that competitors cannot copy overnight.',
      ],
    },

    { t: 'h2', text: 'Common reputation management mistakes', id: 'mistakes' },
    {
      t: 'ul',
      items: [
        'Ignoring reviews for weeks, then replying to everything at once.',
        'Replying with the same template to every review.',
        'Arguing with customers in public.',
        'Only asking for feedback from customers you expect to be happy.',
        'Offering discounts or gifts in exchange for reviews.',
        'Treating a rating as the goal instead of a measurement of how well you serve customers.',
        'Having no named owner, so nothing gets done.',
        'Measuring nothing, which leaves you guessing about whether things are improving.',
      ],
    },

    { t: 'h2', text: 'A 90-day starter plan', id: 'ninety-day-plan' },
    {
      t: 'ol',
      items: [
        '**Days 1 to 14: Set the baseline.** List your review sources, record your current rating and review count, enable notifications, and name an owner.',
        '**Days 15 to 30: Reply to everything.** Respond to every existing review you have not answered, using the principles above. Prepare reply templates you can personalise.',
        '**Days 31 to 60: Start collecting.** Add a review request and a private feedback option to the end of every job or visit, with a short reminder sequence.',
        '**Days 61 to 90: Measure and improve.** Compare your rating, review count and funnel with the baseline, identify the top recurring complaint, and fix it.',
      ],
    },
    {
      t: 'p',
      text: 'Choosing a tool? Read our [buyer’s guide to reputation management software](/blog/best-reputation-management-software-for-small-businesses), and for the toughest replies see [how to respond to negative Google reviews](/blog/how-to-respond-to-negative-google-reviews). Reputation management is not about spin. It is about listening to customers, answering them honestly, and getting a little better every month. Do that consistently and the public record of your business will start to reflect the quality you already deliver.',
    },
  ],
};
