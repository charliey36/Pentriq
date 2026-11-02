/**
 * Shared text understanding for Pentriq Intelligence.
 *
 * A small, explainable lexicon (not a model): it runs locally, costs nothing, sends no customer text to a third
 * party, and every label it produces can be traced to the words that triggered it. Feedback triage, Google review
 * themes and the customer summary all read text through these functions so they never disagree about what a
 * comment is "about".
 *
 * Tuned for UK service businesses (salons, clinics, trades, studios). Matching is on whole words / short phrases
 * after lower-casing and stripping punctuation, with simple negation handling ("not friendly", "wasn't clean").
 */

export const TOPICS = [
  'staff',
  'wait_time',
  'price',
  'quality',
  'cleanliness',
  'booking',
  'communication',
  'atmosphere',
  'results',
] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  staff: 'Staff & service',
  wait_time: 'Waiting time',
  price: 'Price & value',
  quality: 'Quality of work',
  cleanliness: 'Cleanliness',
  booking: 'Booking & scheduling',
  communication: 'Communication',
  atmosphere: 'Atmosphere',
  results: 'Results & outcome',
};

/** Phrases first (matched against the normalised text), then single words (matched against tokens). */
const TOPIC_TERMS: Record<Topic, string[]> = {
  staff: [
    'staff', 'stylist', 'therapist', 'technician', 'receptionist', 'reception', 'team', 'barber', 'dentist',
    'hygienist', 'nurse', 'doctor', 'practitioner', 'engineer', 'plumber', 'electrician', 'friendly', 'rude',
    'polite', 'welcoming', 'attitude', 'helpful', 'unhelpful', 'professional', 'unprofessional', 'manager',
    'customer service',
  ],
  wait_time: [
    'wait', 'waited', 'waiting', 'late', 'delay', 'delayed', 'queue', 'slow', 'quick', 'quickly', 'prompt',
    'on time', 'kept waiting', 'running late', 'took ages', 'took forever', 'hour late', 'minutes late',
  ],
  price: [
    'price', 'prices', 'priced', 'cost', 'costs', 'expensive', 'overpriced', 'cheap', 'affordable', 'value',
    'charge', 'charged', 'overcharged', 'fee', 'fees', 'bill', 'refund', 'money', 'pricey', 'worth it',
    'value for money', 'rip off',
  ],
  quality: [
    'quality', 'job', 'work', 'workmanship', 'finish', 'cut', 'colour', 'color', 'treatment', 'repair',
    'service was', 'botched', 'mistake', 'wrong', 'uneven', 'careful', 'thorough', 'attention to detail',
    'standard', 'skilled', 'skill',
  ],
  cleanliness: [
    'clean', 'cleanliness', 'dirty', 'hygiene', 'hygienic', 'unhygienic', 'tidy', 'untidy', 'mess', 'messy',
    'spotless', 'smell', 'smelled', 'smelt', 'dusty', 'filthy',
  ],
  booking: [
    'booking', 'book', 'booked', 'appointment', 'appointments', 'cancel', 'cancelled', 'canceled',
    'reschedule', 'rescheduled', 'availability', 'slot', 'slots', 'double booked', 'online booking',
    'no show', 'diary',
  ],
  communication: [
    'call', 'called', 'phone', 'email', 'emailed', 'message', 'messaged', 'reply', 'replied', 'respond',
    'response', 'contact', 'explained', 'informed', 'communication', 'listened', 'ignored', 'never heard',
    'got back', 'kept me updated', 'no reply',
  ],
  atmosphere: [
    'atmosphere', 'ambience', 'ambiance', 'music', 'relaxing', 'relaxed', 'cosy', 'cozy', 'comfortable',
    'uncomfortable', 'noisy', 'loud', 'vibe', 'decor', 'parking', 'location', 'cold', 'warm',
  ],
  results: [
    'result', 'results', 'outcome', 'improvement', 'improved', 'looks', 'look', 'feel', 'felt', 'pain',
    'painful', 'healed', 'fixed', 'still broken', 'difference', 'transformation', 'lasted', 'lasting',
  ],
};

const POSITIVE = new Set([
  'great', 'excellent', 'amazing', 'lovely', 'friendly', 'love', 'loved', 'brilliant', 'fantastic', 'perfect',
  'happy', 'recommend', 'recommended', 'professional', 'clean', 'thank', 'thanks', 'wonderful', 'best', 'good',
  'superb', 'outstanding', 'helpful', 'kind', 'welcoming', 'relaxing', 'quick', 'efficient', 'pleased',
  'delighted', 'impressed', 'awesome', 'beautiful', 'spotless', 'reasonable', 'affordable', 'thorough',
  'attentive', 'polite', 'gorgeous', 'fab', 'fabulous', 'stunning', 'smooth', 'easy', 'prompt', 'skilled',
]);

const NEGATIVE = new Set([
  'bad', 'terrible', 'awful', 'rude', 'dirty', 'late', 'slow', 'expensive', 'overpriced', 'disappointed',
  'disappointing', 'poor', 'worst', 'unhappy', 'broken', 'mistake', 'wrong', 'unprofessional', 'ignored',
  'horrible', 'useless', 'appalling', 'shocking', 'disgusting', 'filthy', 'messy', 'unhelpful', 'painful',
  'uncomfortable', 'noisy', 'cancelled', 'canceled', 'overcharged', 'botched', 'uneven', 'unhygienic',
  'waited', 'waiting', 'annoyed', 'angry', 'upset', 'frustrated', 'frustrating', 'complaint', 'refund',
  'avoid', 'never', 'cold', 'dismissive', 'careless', 'damaged', 'ruined', 'nightmare', 'joke',
]);

const NEGATIVE_PHRASES = [
  'never again', 'not happy', 'not impressed', 'waste of money', 'waste of time', 'rip off', 'kept waiting',
  'took ages', 'took forever', 'no reply', 'never heard back', 'would not recommend', "wouldn't recommend",
  'not worth', 'still broken', 'double booked', 'no show',
];

const POSITIVE_PHRASES = ['highly recommend', 'value for money', 'worth it', 'above and beyond', 'on time', 'thank you'];

const NEGATORS = new Set(['not', 'no', 'never', "isn't", 'isnt', "wasn't", 'wasnt', "weren't", "didn't", 'didnt', "don't", 'dont', 'hardly', 'barely']);

/** Words that make a comment a safety, legal or money matter: these are escalated whatever the rating. */
export const ESCALATION_TERMS: Record<'safety' | 'legal' | 'money', string[]> = {
  safety: [
    'allergic', 'allergy', 'reaction', 'burn', 'burned', 'burnt', 'injury', 'injured', 'hurt', 'bleeding',
    'infection', 'infected', 'unsafe', 'dangerous', 'rash', 'swelling', 'swollen', 'scar', 'food poisoning',
    'hospital', 'a&e',
  ],
  legal: ['solicitor', 'lawyer', 'legal action', 'sue', 'suing', 'trading standards', 'small claims', 'ombudsman', 'court'],
  money: ['refund', 'chargeback', 'money back', 'compensation', 'overcharged', 'charged twice', 'dispute'],
};

/** Lower-case, unify apostrophes, strip punctuation to spaces, collapse whitespace. */
export function normaliseText(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}'&\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

export function tokenize(text: string): string[] {
  return normaliseText(text).trim().split(' ').filter(Boolean);
}

function hasPhrase(normalised: string, phrase: string): boolean {
  return normalised.includes(` ${phrase} `);
}

/** Topics a text mentions, with the terms that matched (for "why was this tagged?" explanations). */
export function detectTopics(text: string): Array<{ topic: Topic; terms: string[] }> {
  if (!text.trim()) return [];
  const normalised = normaliseText(text);
  const tokens = new Set(normalised.trim().split(' '));
  const found: Array<{ topic: Topic; terms: string[] }> = [];
  for (const topic of TOPICS) {
    const terms = TOPIC_TERMS[topic].filter((term) => (term.includes(' ') ? hasPhrase(normalised, term) : tokens.has(term)));
    if (terms.length > 0) found.push({ topic, terms });
  }
  return found;
}

export type SentimentResult = {
  /** -1 (very negative) to 1 (very positive); 0 when there is nothing to go on. */
  score: number;
  label: 'positive' | 'neutral' | 'negative' | 'mixed';
  positiveHits: number;
  negativeHits: number;
};

/**
 * Lexicon sentiment with negation: a negator within the previous three tokens flips a word's polarity
 * ("not friendly" counts as negative, "not bad" as mildly positive).
 */
export function scoreSentiment(text: string): SentimentResult {
  const normalised = normaliseText(text);
  const tokens = normalised.trim().split(' ').filter(Boolean);
  let positive = 0;
  let negative = 0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const polarity = POSITIVE.has(word) ? 1 : NEGATIVE.has(word) ? -1 : 0;
    if (polarity === 0) continue;
    // "never" is itself negative; don't let it negate the word after it twice over.
    const window = tokens.slice(Math.max(0, i - 3), i);
    const negated = window.some((w) => NEGATORS.has(w)) && word !== 'never';
    const effective = negated ? -polarity : polarity;
    if (effective > 0) positive += negated ? 0.5 : 1;
    else negative += 1;
  }
  for (const phrase of NEGATIVE_PHRASES) if (hasPhrase(normalised, phrase)) negative += 1.5;
  for (const phrase of POSITIVE_PHRASES) if (hasPhrase(normalised, phrase)) positive += 1;

  const total = positive + negative;
  if (total === 0) return { score: 0, label: 'neutral', positiveHits: 0, negativeHits: 0 };
  const score = Math.round(((positive - negative) / total) * 100) / 100;
  const label = positive > 0 && negative > 0 && Math.abs(score) < 0.34 ? 'mixed' : score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';
  return { score, label, positiveHits: positive, negativeHits: negative };
}

/** Which escalation categories a text triggers (empty when none). */
export function detectEscalations(text: string): Array<'safety' | 'legal' | 'money'> {
  const normalised = normaliseText(text);
  const tokens = new Set(normalised.trim().split(' '));
  return (Object.keys(ESCALATION_TERMS) as Array<'safety' | 'legal' | 'money'>).filter((kind) =>
    ESCALATION_TERMS[kind].some((term) => (term.includes(' ') || term.includes('&') ? hasPhrase(normalised, term) : tokens.has(term)))
  );
}

/** A short, single-line excerpt around the first matching term, for "what customers said" quotes. */
export function excerpt(text: string, terms: string[], maxLength = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const lower = clean.toLowerCase();
  const hit = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, Math.min(hit - Math.floor(maxLength / 3), clean.length - maxLength));
  const slice = clean.slice(start, start + maxLength).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + maxLength < clean.length ? '…' : ''}`;
}
