import { normalizePhone } from '@/lib/phone';

/**
 * Decides which customer each CSV row belongs to.
 *
 * Identity is the email address OR the phone number. Names are never used.
 *
 *  - Nothing matches            → a new customer.
 *  - Email and/or phone matches → that customer (updated, not duplicated).
 *  - Email matches one customer and phone matches a DIFFERENT one → CONFLICT.
 *    Nothing is merged or written for that row; it is reported for manual review.
 *
 * Rows are resolved in file order against both the customers already in the
 * database and the customers earlier rows in the same file would create, so
 * "row 1: a@x.com + 0777" followed by "row 2: b@x.com + 0777" is recognised as
 * one person rather than creating two customers sharing a phone number.
 *
 * Pure function: no database access, so every rule here is unit-tested.
 */
export type ExistingContact = { id: string; name: string; email: string; phone: string | null };
export type IdentityRow = { row: number; name: string; email: string; phone: string | null };

export type IdentityEntity = {
  /** `c:<customer id>` for an existing customer, `n:<first row>` for one this import will create. */
  key: string;
  existingId: string | null;
  name: string;
  email: string;
  phone: string | null;
  /** For an existing customer: a phone number from the file to store because they had none. */
  phoneToFill: string | null;
};

export type MatchedBy = 'email' | 'phone' | 'email and phone';

export type IdentityResolution = {
  entities: Map<string, IdentityEntity>;
  rowEntity: Map<number, string>;
  matchedBy: Map<number, MatchedBy | 'new'>;
  conflicts: { row: number; reason: string }[];
};

export const entityKeyForExisting = (id: string) => `c:${id}`;

export function resolveImportIdentities(rows: IdentityRow[], existing: ExistingContact[]): IdentityResolution {
  const entities = new Map<string, IdentityEntity>();
  const emailIndex = new Map<string, string>(); // lowercase email → entity key
  const phoneIndex = new Map<string, Set<string>>(); // normalised phone → entity keys

  const addPhone = (phone: string, key: string) => {
    const set = phoneIndex.get(phone) ?? new Set<string>();
    set.add(key);
    phoneIndex.set(phone, set);
  };

  for (const c of existing) {
    const key = entityKeyForExisting(c.id);
    entities.set(key, { key, existingId: c.id, name: c.name, email: c.email, phone: c.phone, phoneToFill: null });
    emailIndex.set(c.email.toLowerCase(), key);
    const p = normalizePhone(c.phone);
    if (p) addPhone(p, key);
  }

  const describe = (key: string) => {
    const e = entities.get(key)!;
    return e.existingId ? `${e.name} (${e.email})` : `${e.name} (${e.email}, from an earlier row in this file)`;
  };

  const rowEntity = new Map<number, string>();
  const matchedBy = new Map<number, MatchedBy | 'new'>();
  const conflicts: { row: number; reason: string }[] = [];

  for (const r of rows) {
    const email = r.email.toLowerCase();
    const phone = normalizePhone(r.phone);

    const byEmail = emailIndex.get(email);
    const phoneKeys = phone ? [...(phoneIndex.get(phone) ?? [])] : [];

    // When several customers already share this phone, the email can pick the right one.
    let byPhone: string | undefined;
    let ambiguousPhone = false;
    if (phoneKeys.length === 1) byPhone = phoneKeys[0];
    else if (phoneKeys.length > 1) {
      if (byEmail && phoneKeys.includes(byEmail)) byPhone = byEmail;
      else ambiguousPhone = true;
    }

    if (ambiguousPhone) {
      conflicts.push({
        row: r.row,
        reason: `Phone ${r.phone} is on ${phoneKeys.length} different customers (${phoneKeys.map(describe).join('; ')}), so the right one can't be chosen. Not merged — review manually.`,
      });
      continue;
    }
    if (byEmail && byPhone && byEmail !== byPhone) {
      conflicts.push({
        row: r.row,
        reason: `Email ${r.email} belongs to ${describe(byEmail)}, but phone ${r.phone} belongs to a different customer, ${describe(byPhone)}. Not merged — review these two customers manually.`,
      });
      continue;
    }

    let key = byEmail ?? byPhone;
    if (!key) {
      key = `n:${r.row}`;
      entities.set(key, { key, existingId: null, name: r.name, email: r.email, phone: r.phone, phoneToFill: null });
      matchedBy.set(r.row, 'new');
    } else {
      matchedBy.set(r.row, byEmail && byPhone ? 'email and phone' : byEmail ? 'email' : 'phone');
      const entity = entities.get(key)!;
      // Only ever fill a blank; never overwrite what the customer already has.
      if (phone && !normalizePhone(entity.phone) && !entity.phoneToFill && r.phone) {
        if (entity.existingId) entity.phoneToFill = r.phone.trim();
        entity.phone = r.phone.trim();
      }
    }

    // Remember this row's identifiers so later rows resolve to the same customer.
    emailIndex.set(email, key);
    if (phone) addPhone(phone, key);
    rowEntity.set(r.row, key);
  }

  return { entities, rowEntity, matchedBy, conflicts };
}
