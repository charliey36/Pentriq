import { redirect } from 'next/navigation';
import { requireAccess } from '@/lib/business';
import { can, type Capability } from '@/lib/permissions';

/**
 * Gate for pages, server actions and route handlers: returns the business, user and role when the signed-in
 * member holds `capability`, otherwise redirects to the dashboard with ?denied=1 (the dashboard explains why).
 * Row-level security only proves membership, so every privileged operation must call this.
 */
export async function requireCapability(capability: Capability) {
  const access = await requireAccess();
  if (!can(access.role, capability)) redirect('/dashboard?denied=1');
  return access;
}
