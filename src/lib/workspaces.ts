import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import {
  canAccessWorkspace,
  canCreateWorkspace,
  canManageWorkspace,
  type Membership,
} from "@/lib/access";
import type { WorkspaceRole } from "@prisma/client";

/** Thrown when an actor lacks permission for an operation. */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The actor's membership row for a workspace (role only), or null. */
async function membershipFor(
  workspaceId: string,
  userId: string,
): Promise<Membership> {
  const m = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m;
}

/** Workspaces the actor can see: all for super_admin, else those they belong to. */
export async function listWorkspacesForUser(actor: CurrentUser) {
  if (actor.role === "super_admin") {
    return db.workspace.findMany({ orderBy: { createdAt: "desc" } });
  }
  return db.workspace.findMany({
    where: { members: { some: { userId: actor.id } } },
    orderBy: { createdAt: "desc" },
  });
}

/** super_admin only. Creates a workspace. */
export async function createWorkspace(actor: CurrentUser, name: string) {
  if (!canCreateWorkspace(actor.role)) throw new ForbiddenError();
  const clean = name.trim();
  if (!clean) throw new Error("Workspace name is required");
  return db.workspace.create({
    data: { name: clean, createdById: actor.id },
  });
}

/** Returns the workspace with members+projects if the actor may access it, else null. */
export async function getWorkspaceForUser(actor: CurrentUser, workspaceId: string) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: { include: { user: true }, orderBy: { createdAt: "asc" } },
      projects: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!workspace) return null;
  const membership: Membership =
    workspace.members.find((m) => m.userId === actor.id) ?? null;
  if (!canAccessWorkspace(actor.role, membership)) return null;
  return { workspace, membership };
}

/** Adds (or updates the role of) a member by email. super_admin or workspace manager only. */
export async function addMember(
  actor: CurrentUser,
  workspaceId: string,
  email: string,
  role: WorkspaceRole,
) {
  const membership = await membershipFor(workspaceId, actor.id);
  if (!canManageWorkspace(actor.role, membership)) throw new ForbiddenError();
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error("No user with that email has signed in yet");
  return db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    create: { workspaceId, userId: user.id, role },
    update: { role },
  });
}

/** Removes a member. super_admin or workspace manager only. */
export async function removeMember(
  actor: CurrentUser,
  workspaceId: string,
  userId: string,
) {
  const membership = await membershipFor(workspaceId, actor.id);
  if (!canManageWorkspace(actor.role, membership)) throw new ForbiddenError();
  await db.workspaceMember.deleteMany({ where: { workspaceId, userId } });
}
