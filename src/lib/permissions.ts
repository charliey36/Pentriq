/**
 * Role-based access control for a business ("organisation").
 *
 * Roles (stored on business_members.role):
 *   owner  - exactly one per business (businesses.owner_id): everything, including billing and account deletion
 *   admin  - runs the business day to day: settings, integrations, data export, and managing staff
 *   staff  - works with customers, reviews and feedback; cannot change configuration, billing or team
 *
 * Row-level security only proves "is a member of this business", so these capabilities are enforced in the
 * server layer (see requireCapability in business-access.ts). Keep this table the single source of truth.
 */
export const ROLES = ['owner', 'admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];
export type AssignableRole = Exclude<Role, 'owner'>;

export const CAPABILITIES = [
  'customers.read',
  'customers.write',
  'settings.write',
  'integrations.manage',
  'data.export',
  'team.manage',
  'billing.manage',
  'account.delete',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set(CAPABILITIES),
  admin: new Set<Capability>(['customers.read', 'customers.write', 'settings.write', 'integrations.manage', 'data.export', 'team.manage']),
  staff: new Set<Capability>(['customers.read', 'customers.write']),
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, capability: Capability): boolean {
  return role ? MATRIX[role].has(capability) : false;
}

/**
 * Least privilege for delegation: an owner can grant admin or staff; an admin can only grant staff, so an admin
 * can never mint another admin (privilege escalation) or touch the owner. Nobody can create a second owner.
 */
export function canAssign(actor: Role, target: Role): boolean {
  if (target === 'owner') return false;
  if (actor === 'owner') return true;
  return actor === 'admin' && target === 'staff';
}

/** May `actor` change or remove a member who currently holds `target`? Same rule as granting that role. */
export function canManageMember(actor: Role, target: Role): boolean {
  return canAssign(actor, target);
}

export const ROLE_LABELS: Record<Role, { label: string; summary: string }> = {
  owner: { label: 'Owner', summary: 'Full access, including billing and closing the account.' },
  admin: { label: 'Admin', summary: 'Settings, integrations, data export and staff management. No billing.' },
  staff: { label: 'Staff', summary: 'Customers, reviews and feedback only.' },
};
