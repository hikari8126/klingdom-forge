import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import {
  canAccessWorkspace,
  canCreateWorkspace,
  canManageWorkspace,
  type Membership,
} from "@/lib/access";
import type { WorkspaceRole } from "@prisma/client";
import { encryptSecret, decryptSecret, getEncKey } from "@/lib/crypto";

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

/** Workspaces the actor can see, each with project & member counts — for the cards grid. */
export async function listWorkspaceCardsForUser(actor: CurrentUser) {
  const where =
    actor.role === "super_admin"
      ? {}
      : { members: { some: { userId: actor.id } } };
  return db.workspace.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { projects: true, members: true } } },
  });
}

/** The actor's most-recently-created workspace id, or null if they have none. */
export async function getLatestWorkspaceId(actor: CurrentUser): Promise<string | null> {
  const where =
    actor.role === "super_admin"
      ? {}
      : { members: { some: { userId: actor.id } } };
  const w = await db.workspace.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return w?.id ?? null;
}

/** Studio href: the workspace the actor most recently opened (if still accessible),
 *  else their most-recently-created workspace, else the workspaces list. */
export async function getLatestStudioHref(actor: CurrentUser): Promise<string> {
  const u = await db.user.findUnique({ where: { id: actor.id }, select: { lastWorkspaceId: true } });
  if (u?.lastWorkspaceId) {
    const accessible = await db.workspace.findFirst({
      where:
        actor.role === "super_admin"
          ? { id: u.lastWorkspaceId }
          : { id: u.lastWorkspaceId, members: { some: { userId: actor.id } } },
      select: { id: true },
    });
    if (accessible) return `/workspaces/${accessible.id}/studio`;
  }
  const id = await getLatestWorkspaceId(actor);
  return id ? `/workspaces/${id}/studio` : "/workspaces";
}

/** Record that the actor opened a workspace (for the "last opened" Studio shortcut). */
export async function recordWorkspaceOpened(actor: CurrentUser, workspaceId: string): Promise<void> {
  await db.user.update({ where: { id: actor.id }, data: { lastWorkspaceId: workspaceId } });
}

/** Rename a workspace. Manager or super_admin only. */
export async function renameWorkspace(actor: CurrentUser, workspaceId: string, name: string) {
  const membership = await membershipFor(workspaceId, actor.id);
  if (!canManageWorkspace(actor.role, membership)) throw new ForbiddenError();
  const clean = name.trim();
  if (!clean) throw new Error("Tên workspace không được để trống");
  await db.workspace.update({ where: { id: workspaceId }, data: { name: clean } });
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

/** Save (or replace) the workspace-level Kling API key. Super Admin only. */
export async function saveWorkspaceKlingKey(
  actor: CurrentUser,
  workspaceId: string,
  apiKey: string,
) {
  if (actor.role !== "super_admin") throw new ForbiddenError();
  const clean = apiKey.trim();
  if (!clean) throw new Error("API key không được để trống");
  const enc = encryptSecret(clean, getEncKey());
  await db.workspace.update({ where: { id: workspaceId }, data: { klingApiKeyEnc: enc } });
}

/** Clear the workspace-level Kling API key. Super Admin only. */
export async function clearWorkspaceKlingKey(actor: CurrentUser, workspaceId: string) {
  if (actor.role !== "super_admin") throw new ForbiddenError();
  await db.workspace.update({ where: { id: workspaceId }, data: { klingApiKeyEnc: null } });
}

/** Worker-side: decrypted API key for a workspace, looked up via projectId. Returns null if not set. */
export async function getWorkspaceKeyForProject(
  projectId: string,
): Promise<{ accessKey: string } | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspace: { select: { klingApiKeyEnc: true } } },
  });
  if (!project?.workspace.klingApiKeyEnc) return null;
  return { accessKey: decryptSecret(project.workspace.klingApiKeyEnc, getEncKey()) };
}
