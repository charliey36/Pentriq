/**
 * Referral promotion rewards. Each side of a promotion (the referrer and the
 * referred customer) is independently either a number of loyalty points or a
 * free-text reward such as "£10 Off First Visit". Pure, so it is shared by the
 * server actions, the form and tests.
 */

export type RewardType = 'points' | 'custom';

export type Reward = { type: RewardType; points: number | null; label: string };

export const MAX_POINTS = 1_000_000;
const MAX_TEXT = 200;

/** Human-readable label stored alongside the structured reward. */
export function formatReward(type: RewardType, points: number | null, text: string): string {
  if (type === 'points') return `${points ?? 0} Loyalty ${points === 1 ? 'Point' : 'Points'}`;
  return text.trim();
}

/** Reads `<prefix>_type`, `<prefix>_points` and `<prefix>_text` from a form. */
export function parseRewardFields(
  formData: FormData,
  prefix: string,
  who: string
): { error: string } | { reward: Reward } {
  const type: RewardType = formData.get(`${prefix}_type`) === 'points' ? 'points' : 'custom';
  if (type === 'points') {
    const points = Number(String(formData.get(`${prefix}_points`) ?? '').trim());
    if (!Number.isInteger(points) || points < 1 || points > MAX_POINTS) {
      return { error: `${who}: enter a whole number of points (1 or more).` };
    }
    return { reward: { type, points, label: formatReward(type, points, '') } };
  }
  const text = String(formData.get(`${prefix}_text`) ?? '').trim().slice(0, MAX_TEXT);
  if (!text) return { error: `${who}: describe the reward, e.g. "£10 Off First Visit".` };
  return { reward: { type, points: null, label: text } };
}
