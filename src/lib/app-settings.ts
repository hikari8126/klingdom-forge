import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";

const ROLE_VALUES = ["super_admin", "manager", "member"] as const;

export type AppRole = (typeof ROLE_VALUES)[number];

function assertSuperAdmin(actor: CurrentUser) {
  if (actor.role !== "super_admin") throw new Error("Forbidden");
}

export function parseAppRole(value: FormDataEntryValue | null): Role {
  const role = String(value ?? "member");
  return ROLE_VALUES.includes(role as AppRole) ? (role as Role) : "member";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function listUsersForRoleSettings(actor: CurrentUser) {
  assertSuperAdmin(actor);
  return db.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
}

export async function setUserRoleByEmail(
  actor: CurrentUser,
  email: string,
  role: Role,
) {
  assertSuperAdmin(actor);
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Email không hợp lệ");
  if (actor.email.toLowerCase() === cleanEmail && role !== "super_admin") {
    throw new Error("Không thể tự hạ quyền Super Admin của chính bạn");
  }

  return db.user.upsert({
    where: { email: cleanEmail },
    create: { email: cleanEmail, role },
    update: { role },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
}

export async function listWorkspaceApiSettings(actor: CurrentUser) {
  assertSuperAdmin(actor);
  const workspaces = await db.workspace.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, klingApiKeyEnc: true, klingAccountId: true, createdAt: true },
  });
  return workspaces.map(({ klingApiKeyEnc, ...workspace }) => ({
    ...workspace,
    hasKlingKey: Boolean(klingApiKeyEnc),
  }));
}
