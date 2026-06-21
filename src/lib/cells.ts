import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import type { Job } from "@prisma/client";
import { getProjectForUser } from "@/lib/projects";
import { canCreateProject } from "@/lib/access";
import { ForbiddenError } from "@/lib/workspaces";
import { assetPath } from "@/lib/assets";

export type CellParams = {
  startAssetId: string;
  imagePath: string;
  endAssetId?: string;
  endPath?: string;
  prompt?: string;
  modelName: string;
  mode: "std" | "pro";
  duration: "5" | "10";
};

async function assertCanEdit(actor: CurrentUser, projectId: string) {
  const access = await getProjectForUser(actor, projectId);
  if (!access || !canCreateProject(actor.role, access.membership)) throw new ForbiddenError();
}

/** All cells (jobs of any status, incl. draft) in a project, oldest first. */
export async function listCells(actor: CurrentUser, projectId: string): Promise<Job[]> {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  return db.job.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

/** Create a draft cell from a start-image asset. */
export async function createCell(actor: CurrentUser, projectId: string, startAssetId: string) {
  await assertCanEdit(actor, projectId);
  const imagePath = await assetPath(startAssetId);
  if (!imagePath) throw new Error("Ảnh không tồn tại");
  const params: CellParams = { startAssetId, imagePath, modelName: "kling-v2", mode: "std", duration: "5" };
  return db.job.create({
    data: { projectId, createdById: actor.id, type: "image2video", status: "draft", params: params as object },
  });
}

/** Patch a draft cell's settings/frames. `endAssetId` null clears the end frame. */
export async function updateCell(
  actor: CurrentUser,
  jobId: string,
  patch: {
    prompt?: string;
    modelName?: string;
    mode?: "std" | "pro";
    duration?: "5" | "10";
    endAssetId?: string | null;
  },
) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  const params = { ...(job.params as CellParams) };
  if (patch.prompt !== undefined) params.prompt = patch.prompt;
  if (patch.modelName !== undefined) params.modelName = patch.modelName;
  if (patch.mode !== undefined) params.mode = patch.mode;
  if (patch.duration !== undefined) params.duration = patch.duration;
  if (patch.endAssetId !== undefined) {
    params.endAssetId = patch.endAssetId ?? undefined;
    params.endPath = patch.endAssetId ? (await assetPath(patch.endAssetId)) ?? undefined : undefined;
  }
  return db.job.update({ where: { id: jobId }, data: { params: params as object } });
}

export async function deleteCell(actor: CurrentUser, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  await assertCanEdit(actor, job.projectId);
  await db.job.delete({ where: { id: jobId } });
}

/** Variant: clone a cell (same frames+settings) as a new draft right after it. */
export async function duplicateCell(actor: CurrentUser, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  return db.job.create({
    data: {
      projectId: job.projectId,
      createdById: actor.id,
      type: job.type,
      status: "draft",
      params: job.params as object,
      batchId: job.batchId ?? undefined,
    },
  });
}

/** Generate: move a draft (or finished) cell into the queue for the worker. */
export async function generateCell(actor: CurrentUser, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  if (job.status !== "draft" && job.status !== "succeeded" && job.status !== "failed") return job;
  return db.job.update({
    where: { id: jobId },
    data: { status: "queued", error: null, resultUrl: null, klingAccountId: null, klingTaskId: null },
  });
}
