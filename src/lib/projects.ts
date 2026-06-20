import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import {
  canAccessWorkspace,
  canCreateProject,
  canDeleteProject,
  type Membership,
} from "@/lib/access";
import { ForbiddenError } from "@/lib/workspaces";

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

/** Creates a project in a workspace. super_admin or any member of the workspace. */
export async function createProject(
  actor: CurrentUser,
  workspaceId: string,
  name: string,
) {
  const membership = await membershipFor(workspaceId, actor.id);
  if (!canCreateProject(actor.role, membership)) throw new ForbiddenError();
  const clean = name.trim();
  if (!clean) throw new Error("Project name is required");
  return db.project.create({
    data: { name: clean, workspaceId, createdById: actor.id },
  });
}

/** Deletes a project. super_admin or the workspace manager. */
export async function deleteProject(actor: CurrentUser, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  const membership = await membershipFor(project.workspaceId, actor.id);
  if (!canDeleteProject(actor.role, membership)) throw new ForbiddenError();
  await db.project.delete({ where: { id: projectId } });
}

/** Returns the project + its workspace if the actor may access it, else null. */
export async function getProjectForUser(actor: CurrentUser, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });
  if (!project) return null;
  const membership =
    actor.role === "super_admin"
      ? null
      : await db.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: actor.id } },
          select: { role: true },
        });
  if (!canAccessWorkspace(actor.role, membership)) return null;
  return { project, membership };
}
