/**
 * Feedback triage: turns a private feedback message into something a busy owner can act on in seconds.
 *
 * For each message it works out sentiment, what it is about (topics), how urgent it is and why, and how long it
 * has been waiting against the response target. It also drafts a reply the owner can edit and send from their
 * own inbox. The draft never invents offers, refunds, discounts or facts; it acknowledges, addresses each topic
 * raised, and invites a conversation. All of this runs locally: no customer text leaves Pentriq.
 */
import { TOPIC_LABELS, detectEscalations, detectTopics, scoreSentiment, type Topic } from '@/lib/intelligence/lexicon';

export type FeedbackStatus = 'new' | 'acknowledged' | 'resolved';
export type Urgency = 'critical' | 'high' | 'normal' | 'low';

/** Owners should reply to new private feedback within two days; older items are flagged as overdue. */
export const RESPONSE_TARGET_HOURS = 48;

export type TriageInput = {
  rating: number | null;
  comment: string;
  createdAt: string | Date;
  status: FeedbackStatus;
};

export type Triage = {
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  /** -1..1 blended from the star rating (when given) and the text. */
  sentimentScore: number;
  topics: Topic[];
  urgency: Urgency;
  /** 0-100, used to order the inbox. */
  urgencyScore: number;
  /** Plain-language reasons behind the urgency, e.g. "Mentions a reaction or injury". */
  reasons: string[];
  escalations: Array<'safety' | 'legal' | 'money'>;
  ageHours: number;
  /** Still new and older than RESPONSE_TARGET_HOURS. */
  overdue: boolean;
};

const ESCALATION_REASONS: Record<'safety' | 'legal' | 'money', string> = {
  safety: 'Mentions a possible reaction, injury or safety issue',
  legal: 'Mentions legal action or a regulator',
  money: 'Asks about a refund or a charge',
};

function ratingToScore(rating: number): number {
  // 1★ = -1, 3★ = 0, 5★ = +1
  return Math.max(-1, Math.min(1, (rating - 3) / 2));
}

export function triageFeedback(input: TriageInput, now: Date = new Date()): Triage {
  const text = input.comment ?? '';
  const textSentiment = scoreSentiment(text);
  const hasRating = typeof input.rating === 'number' && input.rating >= 1 && input.rating <= 5;
  const hasText = textSentiment.positiveHits + textSentiment.negativeHits > 0;

  // The star rating is the customer's own verdict, so it carries more weight than our reading of the words.
  const blended = hasRating && hasText
    ? ratingToScore(input.rating as number) * 0.6 + textSentiment.score * 0.4
    : hasRating
      ? ratingToScore(input.rating as number)
      : textSentiment.score;
  const sentimentScore = Math.round(blended * 100) / 100;
  const sentiment: Triage['sentiment'] =
    textSentiment.label === 'mixed' && Math.abs(sentimentScore) < 0.4
      ? 'mixed'
      : sentimentScore > 0.2
        ? 'positive'
        : sentimentScore < -0.2
          ? 'negative'
          : 'neutral';

  const topics = detectTopics(text).map((t) => t.topic);
  const escalations = detectEscalations(text);
  const created = new Date(input.createdAt);
  const ageHours = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 3_600_000));
  const overdue = input.status === 'new' && ageHours > RESPONSE_TARGET_HOURS;

  const reasons: string[] = [];
  let score = 30;
  for (const kind of escalations) {
    reasons.push(ESCALATION_REASONS[kind]);
    score += kind === 'safety' ? 45 : kind === 'legal' ? 40 : 20;
  }
  if (hasRating && (input.rating as number) <= 2) {
    reasons.push(`Rated ${input.rating} out of 5`);
    score += 25;
  } else if (sentiment === 'negative') {
    reasons.push('Negative tone');
    score += 15;
  }
  if (overdue) {
    reasons.push(`Waiting ${Math.floor(ageHours / 24)} days for a reply`);
    score += 15;
  }
  if (sentiment === 'positive' && escalations.length === 0) score -= 20;
  if (input.status !== 'new') score -= 25;
  const urgencyScore = Math.max(0, Math.min(100, Math.round(score)));

  const urgency: Urgency =
    escalations.includes('safety') || escalations.includes('legal') || urgencyScore >= 85
      ? 'critical'
      : urgencyScore >= 55
        ? 'high'
        : urgencyScore >= 25
          ? 'normal'
          : 'low';

  return { sentiment, sentimentScore, topics, urgency, urgencyScore, reasons, escalations, ageHours, overdue };
}

export type TopicSummary = { topic: Topic; label: string; count: number; negative: number; positive: number };

/** How often each topic comes up across a set of triaged items, most-discussed first. */
export function summariseTopics(items: Triage[]): TopicSummary[] {
  const byTopic = new Map<Topic, TopicSummary>();
  for (const item of items) {
    for (const topic of item.topics) {
      const entry = byTopic.get(topic) ?? { topic, label: TOPIC_LABELS[topic], count: 0, negative: 0, positive: 0 };
      entry.count += 1;
      if (item.sentiment === 'negative') entry.negative += 1;
      if (item.sentiment === 'positive') entry.positive += 1;
      byTopic.set(topic, entry);
    }
  }
  return [...byTopic.values()].sort((a, b) => b.count - a.count || b.negative - a.negative || a.label.localeCompare(b.label));
}

export type InboxStats = {
  total: number;
  open: number;
  overdue: number;
  critical: number;
  /** Median hours from received to now for still-open items (null when none are open). */
  medianOpenAgeHours: number | null;
  negativeShare: number | null;
};

export function inboxStats(items: Array<Triage & { status: FeedbackStatus }>): InboxStats {
  const open = items.filter((i) => i.status !== 'resolved');
  const ages = open.map((i) => i.ageHours).sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  const median = ages.length === 0 ? null : ages.length % 2 ? ages[mid] : Math.round((ages[mid - 1] + ages[mid]) / 2);
  return {
    total: items.length,
    open: open.length,
    overdue: items.filter((i) => i.overdue).length,
    critical: open.filter((i) => i.urgency === 'critical').length,
    medianOpenAgeHours: median,
    negativeShare: items.length ? Math.round((items.filter((i) => i.sentiment === 'negative').length / items.length) * 100) : null,
  };
}

const TOPIC_RESPONSES: Record<Topic, { negative: string; positive: string }> = {
  staff: {
    negative: "I'm sorry the way you were looked after fell short. I'll be speaking with the team about it.",
    positive: "I'll make sure the team hears your kind words.",
  },
  wait_time: {
    negative: "I'm sorry you were kept waiting. We're looking at how we schedule appointments so it doesn't happen again.",
    positive: "It's good to hear everything ran on time for you.",
  },
  price: {
    negative: "Thank you for being open about the price. I'd like to understand what you expected so we can explain or improve.",
    positive: "I'm glad you felt it was good value.",
  },
  quality: {
    negative: "I'm sorry the result wasn't what you hoped for. I'd like to understand exactly what went wrong.",
    positive: "We take a lot of care over our work, so that means a great deal.",
  },
  cleanliness: {
    negative: "Thank you for flagging this. Cleanliness matters to us and I'm looking into it straight away.",
    positive: 'We work hard to keep everything spotless, so thank you for noticing.',
  },
  booking: {
    negative: "I'm sorry booking with us wasn't straightforward. We'll look at what went wrong with your appointment.",
    positive: "I'm glad booking was easy.",
  },
  communication: {
    negative: "I'm sorry we didn't keep you properly informed. That's not the standard we aim for.",
    positive: 'Thank you, we always try to keep people in the loop.',
  },
  atmosphere: {
    negative: "Thank you for the feedback about the space. We want every visit to feel comfortable.",
    positive: "I'm so pleased you enjoyed the atmosphere.",
  },
  results: {
    negative: "I'm sorry you're not happy with how things turned out. I'd like to help put this right if we can.",
    positive: "It's wonderful to hear you're happy with the results.",
  },
};

export type ReplyDraftInput = {
  businessName: string;
  customerName?: string | null;
  triage: Pick<Triage, 'sentiment' | 'topics' | 'escalations'>;
};

function greetingName(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}][\p{L}'’-]{0,29}$/u.test(first) ? first : null;
}

/**
 * A reply the owner can edit and send. Deterministic: same input, same draft. Covers up to two topics so the
 * message stays short, and for safety/legal/money matters asks for a call rather than making any promise.
 */
export function draftFeedbackReply(input: ReplyDraftInput): { subject: string; body: string } {
  const name = greetingName(input.customerName);
  const business = input.businessName.trim() || 'the team';
  const negative = input.triage.sentiment === 'negative' || input.triage.sentiment === 'mixed';
  const lines: string[] = [];

  lines.push(name ? `Hi ${name},` : 'Hello,');
  lines.push('');
  lines.push(
    negative
      ? `Thank you for taking the time to tell us about your recent visit to ${business}. I'm sorry it wasn't the experience you deserved.`
      : `Thank you so much for your feedback about your recent visit to ${business}. It really made our day.`
  );

  const topicLines = input.triage.topics.slice(0, 2).map((topic) => TOPIC_RESPONSES[topic][negative ? 'negative' : 'positive']);
  if (topicLines.length > 0) {
    lines.push('');
    lines.push(topicLines.join(' '));
  }

  lines.push('');
  if (input.triage.escalations.length > 0) {
    lines.push("This is important to us, so I'd like to speak with you personally. Could you reply with a good time and number to call you on?");
  } else if (negative) {
    lines.push("If you're happy to, please reply to this email and let me know a little more. I'd really like the chance to put things right.");
  } else {
    lines.push('We look forward to seeing you again soon.');
  }

  lines.push('');
  lines.push('Kind regards,');
  lines.push(business);

  return {
    subject: negative ? `Your recent visit to ${business}` : `Thank you from ${business}`,
    body: lines.join('\n'),
  };
}

/** A mailto: link that opens the owner's own mail client with the draft filled in. */
export function mailtoLink(to: string, draft: { subject: string; body: string }): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

export const URGENCY_ORDER: Record<Urgency, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** Inbox order: open before resolved, then most urgent, then oldest waiting first. */
export function compareForInbox(
  a: { status: FeedbackStatus; triage: Triage; createdAt: string },
  b: { status: FeedbackStatus; triage: Triage; createdAt: string }
): number {
  const openA = a.status === 'resolved' ? 1 : 0;
  const openB = b.status === 'resolved' ? 1 : 0;
  if (openA !== openB) return openA - openB;
  if (a.triage.urgencyScore !== b.triage.urgencyScore) return b.triage.urgencyScore - a.triage.urgencyScore;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}
