"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createAsset } from "@/lib/assets";
import { createProject } from "@/lib/projects";
import {
  createCell,
  updateCell,
  duplicateCell,
  deleteCell,
  generateCell,
  swapFrames,
  listCells,
} from "@/lib/cells";

function rv(workspaceId: string) {
  revalidatePath(`/workspaces/${workspaceId}/studio`);
}

export async function uploadImagesAction(
  workspaceId: string,
  projectId: string,
  formData: FormData,
) {
  const actor = await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    await createAsset(actor, projectId, f.name, buf);
  }
  rv(workspaceId);
}

export async function createProjectAction(workspaceId: string, name: string) {
  const actor = await requireUser();
  const p = await createProject(actor, workspaceId, name);
  revalidatePath(`/workspaces/${workspaceId}/studio`);
  return p.id;
}

export async function createCellAction(
  workspaceId: string,
  projectId: string,
  startAssetId: string,
) {
  const actor = await requireUser();
  await createCell(actor, projectId, startAssetId);
  rv(workspaceId);
}

export async function updateCellAction(
  workspaceId: string,
  jobId: string,
  patch: {
    prompt?: string;
    modelName?: string;
    mode?: "std" | "pro";
    duration?: "5" | "10";
    endAssetId?: string | null;
  },
) {
  const actor = await requireUser();
  await updateCell(actor, jobId, patch);
  rv(workspaceId);
}

export async function swapFramesAction(workspaceId: string, jobId: string) {
  const actor = await requireUser();
  await swapFrames(actor, jobId);
  rv(workspaceId);
}

export async function duplicateCellAction(workspaceId: string, jobId: string) {
  const actor = await requireUser();
  await duplicateCell(actor, jobId);
  rv(workspaceId);
}

export async function deleteCellAction(workspaceId: string, jobId: string) {
  const actor = await requireUser();
  await deleteCell(actor, jobId);
  rv(workspaceId);
}

export async function generateCellAction(workspaceId: string, jobId: string) {
  const actor = await requireUser();
  await generateCell(actor, jobId);
  rv(workspaceId);
}

export async function generateAllAction(workspaceId: string, projectId: string) {
  const actor = await requireUser();
  const cells = await listCells(actor, projectId);
  for (const c of cells) {
    if (c.status === "draft" || c.status === "succeeded" || c.status === "failed") {
      await generateCell(actor, c.id);
    }
  }
  rv(workspaceId);
}
