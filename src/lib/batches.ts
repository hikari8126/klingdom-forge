import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { canCreateProject } from "@/lib/access";
import { ForbiddenError } from "@/lib/workspaces";

async function assertCanEdit(actor: CurrentUser, projectId: string) {
  const access = await getProjectForUser(actor, projectId);
  if (!access || !canCreateProject(actor.role, access.membership)) throw new ForbiddenError();
}

export async function listBatches(actor: CurrentUser, projectId: string) {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  return db.batch.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { jobs: true } } },
  });
}

export async function createBatch(actor: CurrentUser, projectId: string, name: string) {
  await assertCanEdit(actor, projectId);
  const clean = name.trim() || "Batch mới";
  return db.batch.create({
    data: { projectId, createdById: actor.id, name: clean, source: "studio", total: 0 },
  });
}

export async function renameBatch(actor: CurrentUser, batchId: string, name: string) {
  const batch = await db.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("Batch không tồn tại");
  await assertCanEdit(actor, batch.projectId);
  const clean = name.trim() || "Batch";
  return db.batch.update({ where: { id: batchId }, data: { name: clean } });
}

export async function deleteBatch(actor: CurrentUser, batchId: string) {
  const batch = await db.batch.findUnique({ where: { id: batchId } });
  if (!batch) return;
  await assertCanEdit(actor, batch.projectId);
  await db.batch.delete({ where: { id: batchId } });
}
