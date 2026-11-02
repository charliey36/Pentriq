'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { can, type Capability, type Role } from '@/lib/permissions';

const RoleContext = createContext<Role | null>(null);

/** Makes the signed-in member's role available to client components so they can hide what it cannot use. The server still enforces every capability. */
export function RoleProvider({ role, children }: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role | null {
  return useContext(RoleContext);
}

/** Defaults to allowed when no provider is mounted (marketing pages, tests), because server checks are authoritative. */
export function useCan(capability: Capability): boolean {
  const role = useContext(RoleContext);
  return role === null ? true : can(role, capability);
}
