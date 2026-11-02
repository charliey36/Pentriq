/**
 * Review themes: what customers keep praising and what they keep complaining about, across public Google
 * reviews. Each theme carries its mention count, how positive it is, the average star rating of reviews that
 * mention it, and a short example quote, so owners can see *why* their rating is what it is.
 */
import { TOPIC_LABELS, detectTopics, excerpt, scoreSentiment, type Topic } from '@/lib/intelligence/lexicon';

export type ThemeReview = { rating: number; comment: string | null; review_date: string };

export type Theme = {
  topic: Topic;
  label: string;
  mentions: number;
  positive: number;
  negative: number;
  /** -100..100: share of positive mentions minus share of negative mentions. */
  netSentiment: number;
  averageRating: number;
  example: string | null;
  exampleRating: number | null;
};

export type ThemeReport = {
  analysed: number;
  withText: number;
  themes: Theme[];
  praise: Theme[];
  concerns: Theme[];
};

/** A mention is positive/negative from the review's own text, falling back to its star rating. */
function polarity(rating: number, text: string): 1 | 0 | -1 {
  const s = scoreSentiment(text);
  if (s.label === 'positive') return 1;
  if (s.label === 'negative') return -1;
  if (rating >= 4) return 1;
  if (rating <= 2) return -1;
  return 0;
}

export function analyseReviewThemes(reviews: ThemeReview[], minMentions = 2): ThemeReport {
  const acc = new Map<Topic, { mentions: number; positive: number; negative: number; ratingSum: number; best: { text: string; rating: number; strength: number } | null; worst: { text: string; rating: number; strength: number } | null }>();
  let withText = 0;

  for (const review of reviews) {
    const text = (review.comment ?? '').trim();
    if (!text) continue;
    withText += 1;
    const p = polarity(review.rating, text);
    for (const { topic, terms } of detectTopics(text)) {
      const entry = acc.get(topic) ?? { mentions: 0, positive: 0, negative: 0, ratingSum: 0, best: null, worst: null };
      entry.mentions += 1;
      entry.ratingSum += review.rating;
      if (p > 0) entry.positive += 1;
      if (p < 0) entry.negative += 1;
      const quote = excerpt(text, terms);
      // Keep the most emphatic quote in each direction; shorter quotes win ties (they read better).
      const strength = (p > 0 ? review.rating : 6 - review.rating) * 1000 - quote.length;
      if (p > 0 && (!entry.best || strength > entry.best.strength)) entry.best = { text: quote, rating: review.rating, strength };
      if (p < 0 && (!entry.worst || strength > entry.worst.strength)) entry.worst = { text: quote, rating: review.rating, strength };
      acc.set(topic, entry);
    }
  }

  const themes: Theme[] = [...acc.entries()]
    .filter(([, e]) => e.mentions >= minMentions)
    .map(([topic, e]) => {
      const netSentiment = Math.round(((e.positive - e.negative) / e.mentions) * 100);
      const example = netSentiment >= 0 ? e.best ?? e.worst : e.worst ?? e.best;
      return {
        topic,
        label: TOPIC_LABELS[topic],
        mentions: e.mentions,
        positive: e.positive,
        negative: e.negative,
        netSentiment,
        averageRating: Math.round((e.ratingSum / e.mentions) * 10) / 10,
        example: example?.text ?? null,
        exampleRating: example?.rating ?? null,
      };
    })
    .sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label));

  return {
    analysed: reviews.length,
    withText,
    themes,
    praise: themes.filter((t) => t.netSentiment >= 40).sort((a, b) => b.positive - a.positive).slice(0, 3),
    concerns: themes.filter((t) => t.negative > 0 && t.netSentiment < 20).sort((a, b) => b.negative - a.negative).slice(0, 3),
  };
}
