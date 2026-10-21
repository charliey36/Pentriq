/** Customer emails are scheduled for 08:00 UK time the day after a completed service. */
const TZ = 'Europe/London';
export const SEND_WINDOW_START_HOUR = 8;
export const SEND_WINDOW_END_HOUR = 9;

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** London wall-clock parts for an instant. */
function londonParts(ms: number) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, hour: p.hour, minute: p.minute };
}

/** UTC instant for a London wall-clock time (handles BST/GMT). */
function londonToUtc(y: number, m: number, d: number, hour: number): Date {
  const guess = Date.UTC(y, m - 1, d, hour);
  const offsetAt = (ms: number) => {
    const p = londonParts(ms);
    return Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - ms;
  };
  return new Date(guess - offsetAt(guess - offsetAt(guess)));
}

/** If the current time is outside 08:00-09:00 UK time, move to the next 08:00. */
export function snapToSendWindow(at: Date): Date {
  const p = londonParts(at.getTime());
  if (p.hour >= SEND_WINDOW_START_HOUR && p.hour < SEND_WINDOW_END_HOUR) return at;
  const day = p.hour < SEND_WINDOW_START_HOUR ? p : londonParts(at.getTime() + 24 * 3_600_000);
  return londonToUtc(day.y, day.m, day.d, SEND_WINDOW_START_HOUR);
}

/**
 * When to email a review request for a service done on `serviceDate` (YYYY-MM-DD): 08:00
 * `delayDays` days later (default 1 = the next day; the business's "Review request window"
 * setting), or the next 08:00 if that time has already passed.
 */
export function reviewSendTime(serviceDate: string, now = new Date(), delayDays = 1): Date {
  const [y, m, d] = serviceDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + Math.max(1, Math.round(delayDays) || 1)));
  const target = londonToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), SEND_WINDOW_START_HOUR);
  return target.getTime() >= now.getTime() ? target : snapToSendWindow(now);
}
