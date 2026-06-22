import type { Role, WorkspaceRole } from "@prisma/client";

/** The actor's membership in a given workspace, or null if they have none. */
export type Membership = { role: WorkspaceRole } | null;

export function canCreateWorkspace(role: Role): boolean {
  return role === "super_admin";
}

export function canAccessWorkspace(role: Role, membership: Membership): boolean {
  return role === "super_admin" || membership !== null;
}

export function canManageWorkspace(role: Role, membership: Membership): boolean {
  return role === "super_admin" || membership?.role === "manager";
}

export function canCreateProject(role: Role, membership: Membership): boolean {
  // Any member of the workspace (manager or member) may create projects.
  return role === "super_admin" || membership !== null;
}

export function canDeleteProject(role: Role, membership: Membership): boolean {
  return role === "super_admin" || membership !== null;
}
