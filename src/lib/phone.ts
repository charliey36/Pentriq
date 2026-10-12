/**
 * Phone numbers are stored exactly as typed ("07700 900123", "+44 7700 900123"),
 * so they can only be compared after normalising to a canonical form.
 *
 * Returns digits only, in international form without the "+" (UK numbers become
 * 44…), or null when the value is too short to be a real number. Junk such as
 * "0", "n/a" or "-" must return null: matching customers on a placeholder would
 * merge strangers.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // "(0)" in "+44 (0)7700 900123" is a trunk-prefix hint, not a dialled digit.
  let digits = trimmed.replace(/\(0\)/g, '').replace(/\D/g, '');
  if (!digits) return null;

  const international = trimmed.startsWith('+');
  if (!international && digits.startsWith('00')) digits = digits.slice(2); // 0044… → 44…
  else if (!international && digits.startsWith('0')) digits = `44${digits.slice(1)}`; // 07700… → 447700… (UK default)

  // E.164 allows at most 15 digits; fewer than 7 is not a usable number.
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}
