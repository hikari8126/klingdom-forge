import type { Role } from "@prisma/client";

/** True iff `email`'s domain part exactly equals `allowedDomain` (case-insensitive). */
export function isAllowedEmail(email: string, allowedDomain: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domain === allowedDomain.trim().toLowerCase();
}

/**
 * Resolve a user's GLOBAL role at login time.
 * - Email in the super-admin allowlist → "super_admin" (always wins).
 * - Otherwise keep their existing role, or default a new user to "member".
 */
export function resolveRole(
  email: string,
  superAdminEmails: string[],
  existingRole: Role | null,
): Role {
  const normalized = email.trim().toLowerCase();
  const isAdmin = superAdminEmails.some((e) => e.trim().toLowerCase() === normalized);
  if (isAdmin) return "super_admin";
  return existingRole ?? "member";
}
