/**
 * One password rule for sign-up, password reset and password change (previously sign-up required 8 characters
 * and reset accepted 6). Length-based, per NCSC and NIST SP 800-63B guidance: no composition rules, a sensible
 * minimum, a maximum that stays within bcrypt's 72-byte limit, and a block on the most obviously guessable
 * choices. Supabase Auth applies its own server-side checks as well.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop',
  'iloveyou', 'letmein1', 'welcome1', 'admin123', 'abc12345', 'football', 'baseball', 'sunshine', 'princess',
  '11111111', '00000000', 'pentriq1', 'pentriq123', 'changeme', 'trustno1', 'passw0rd',
]);

export type PasswordCheck = { ok: true } | { ok: false; error: string };

export function checkPassword(password: string, context: { email?: string | null } = {}): PasswordCheck {
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` };
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) return { ok: false, error: `Use at most ${PASSWORD_MAX_LENGTH} characters.` };
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return { ok: false, error: 'That password is too common. Try a short phrase instead.' };
  if (/^(.)\1+$/.test(password)) return { ok: false, error: 'Avoid repeating a single character.' };
  const local = (context.email ?? '').split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return { ok: false, error: 'Avoid using your email address in your password.' };
  return { ok: true };
}

/** 0-4 for a strength meter: length does most of the work, variety adds a little. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  if (!checkPassword(password).ok) return 1;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (password.length >= 16 || (password.length >= 12 && variety >= 3)) return 4;
  if (password.length >= 12 || variety >= 3) return 3;
  return 2;
}
