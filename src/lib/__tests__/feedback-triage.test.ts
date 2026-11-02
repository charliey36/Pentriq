/** @jest-environment node */
import { detectEscalations, detectTopics, excerpt, scoreSentiment } from '../intelligence/lexicon';
import {
  RESPONSE_TARGET_HOURS,
  compareForInbox,
  draftFeedbackReply,
  inboxStats,
  mailtoLink,
  summariseTopics,
  triageFeedback,
} from '../intelligence/feedback-triage';

const NOW = new Date('2026-11-02T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('lexicon', () => {
  it('detects topics from words and phrases', () => {
    const topics = detectTopics('The stylist was rude and I was kept waiting for 40 minutes').map((t) => t.topic);
    expect(topics).toEqual(expect.arrayContaining(['staff', 'wait_time']));
  });

  it('returns no topics for empty text', () => {
    expect(detectTopics('   ')).toEqual([]);
  });

  it('scores clear positive and negative text', () => {
    expect(scoreSentiment('Absolutely brilliant, friendly team, highly recommend').label).toBe('positive');
    expect(scoreSentiment('Terrible service, rude staff, never again').label).toBe('negative');
  });

  it('handles negation', () => {
    expect(scoreSentiment('The staff were not friendly').label).toBe('negative');
    expect(scoreSentiment('nothing').label).toBe('neutral');
  });

  it('flags safety, legal and money issues', () => {
    expect(detectEscalations('I had an allergic reaction after the treatment')).toContain('safety');
    expect(detectEscalations('I will be contacting trading standards')).toContain('legal');
    expect(detectEscalations('I want a refund')).toContain('money');
    expect(detectEscalations('Lovely visit')).toEqual([]);
  });

  it('builds a short excerpt around the matched term', () => {
    const long = `${'Intro words here. '.repeat(10)}The receptionist was wonderful and kind. ${'More text follows. '.repeat(10)}`;
    const quote = excerpt(long, ['receptionist'], 80);
    expect(quote.length).toBeLessThanOrEqual(82);
    expect(quote).toContain('receptionist');
    expect(quote.startsWith('…')).toBe(true);
  });
});

describe('triageFeedback', () => {
  it('marks a 1-star safety complaint as critical with reasons', () => {
    const t = triageFeedback({ rating: 1, comment: 'My skin had a reaction and I am swollen', createdAt: hoursAgo(2), status: 'new' }, NOW);
    expect(t.urgency).toBe('critical');
    expect(t.sentiment).toBe('negative');
    expect(t.reasons.join(' ')).toMatch(/safety/i);
    expect(t.reasons).toContain('Rated 1 out of 5');
  });

  it('treats praise as low urgency', () => {
    const t = triageFeedback({ rating: 5, comment: 'Fantastic, the team were lovely', createdAt: hoursAgo(1), status: 'new' }, NOW);
    expect(t.sentiment).toBe('positive');
    expect(t.urgency).toBe('low');
    expect(t.overdue).toBe(false);
  });

  it('flags overdue items past the response target', () => {
    const t = triageFeedback({ rating: 3, comment: 'It was ok', createdAt: hoursAgo(RESPONSE_TARGET_HOURS + 30), status: 'new' }, NOW);
    expect(t.overdue).toBe(true);
    expect(t.reasons.some((r) => r.startsWith('Waiting'))).toBe(true);
  });

  it('never marks handled items as overdue and lowers their urgency', () => {
    const open = triageFeedback({ rating: 2, comment: 'Slow and expensive', createdAt: hoursAgo(100), status: 'new' }, NOW);
    const handled = triageFeedback({ rating: 2, comment: 'Slow and expensive', createdAt: hoursAgo(100), status: 'resolved' }, NOW);
    expect(handled.overdue).toBe(false);
    expect(handled.urgencyScore).toBeLessThan(open.urgencyScore);
  });

  it('works without a rating', () => {
    const t = triageFeedback({ rating: null, comment: 'Dirty floors and the place smelled', createdAt: hoursAgo(5), status: 'new' }, NOW);
    expect(t.sentiment).toBe('negative');
    expect(t.topics).toContain('cleanliness');
  });
});

describe('summaries and ordering', () => {
  const items = [
    { ...triageFeedback({ rating: 2, comment: 'Waited ages, staff rude', createdAt: hoursAgo(60), status: 'new' }, NOW), status: 'new' as const },
    { ...triageFeedback({ rating: 5, comment: 'Friendly staff', createdAt: hoursAgo(3), status: 'acknowledged' }, NOW), status: 'acknowledged' as const },
    { ...triageFeedback({ rating: 4, comment: 'Good', createdAt: hoursAgo(300), status: 'resolved' }, NOW), status: 'resolved' as const },
  ];

  it('counts topics with sentiment split', () => {
    const topics = summariseTopics(items);
    const staff = topics.find((t) => t.topic === 'staff');
    expect(staff).toMatchObject({ count: 2, negative: 1, positive: 1 });
    expect(topics[0].topic).toBe('staff');
  });

  it('computes inbox stats', () => {
    const stats = inboxStats(items);
    expect(stats).toMatchObject({ total: 3, open: 2, overdue: 1 });
    expect(stats.medianOpenAgeHours).toBe(32);
  });

  it('orders open and urgent first, resolved last', () => {
    const rows = items.map((triage, i) => ({ status: triage.status, triage, createdAt: hoursAgo([60, 3, 300][i]) }));
    const sorted = [...rows].sort(compareForInbox);
    expect(sorted[0].status).toBe('new');
    expect(sorted[sorted.length - 1].status).toBe('resolved');
  });
});

describe('draftFeedbackReply', () => {
  it('apologises, addresses topics and invites a reply for negative feedback', () => {
    const triage = triageFeedback({ rating: 2, comment: 'I was kept waiting and the price was too high', createdAt: hoursAgo(1), status: 'new' }, NOW);
    const draft = draftFeedbackReply({ businessName: 'Glow Studio', customerName: 'Priya Shah', triage });
    expect(draft.body.startsWith('Hi Priya,')).toBe(true);
    expect(draft.body).toMatch(/sorry/i);
    expect(draft.body).toMatch(/waiting/i);
    expect(draft.body).toContain('Glow Studio');
    expect(draft.subject).toContain('Glow Studio');
  });

  it('never promises refunds or discounts, and asks for a call on escalations', () => {
    const triage = triageFeedback({ rating: 1, comment: 'I want a refund, I had a burn', createdAt: hoursAgo(1), status: 'new' }, NOW);
    const draft = draftFeedbackReply({ businessName: 'Glow Studio', customerName: null, triage });
    expect(draft.body.startsWith('Hello,')).toBe(true);
    expect(draft.body).toMatch(/speak with you personally/);
    expect(draft.body).not.toMatch(/discount|voucher|free|we will refund/i);
  });

  it('thanks happy customers', () => {
    const triage = triageFeedback({ rating: 5, comment: 'Loved it', createdAt: hoursAgo(1), status: 'new' }, NOW);
    const draft = draftFeedbackReply({ businessName: 'Glow', customerName: 'Sam', triage });
    expect(draft.body).toMatch(/Thank you so much/);
  });

  it('ignores unsafe greeting names', () => {
    const triage = triageFeedback({ rating: 5, comment: 'Great', createdAt: hoursAgo(1), status: 'new' }, NOW);
    expect(draftFeedbackReply({ businessName: 'Glow', customerName: '<script>', triage }).body.startsWith('Hello,')).toBe(true);
  });

  it('builds an encoded mailto link', () => {
    const link = mailtoLink('sam@example.com', { subject: 'Hi & thanks', body: 'Line 1\nLine 2' });
    expect(link).toBe('mailto:sam%40example.com?subject=Hi%20%26%20thanks&body=Line%201%0ALine%202');
  });
});
