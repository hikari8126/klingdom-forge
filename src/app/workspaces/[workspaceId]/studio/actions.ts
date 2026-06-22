"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createAsset } from "@/lib/assets";
import { createProject, renameProject, deleteProject } from "@/lib/projects";
import { createBatch, renameBatch, deleteBatch } from "@/lib/batches";
import {
  createCell,
  updateCell,
  duplicateCell,
  deleteCell,
  generateCell,
  swapFrames,
  listCells,
  createMotionCell,
  updateMotionCell,
  createAvatarCell,
  updateAvatarCell,
  convertCellType,
} from "@/lib/cells";
import { assertVideoSize } from "@/lib/uploads";

function rv(workspaceId: string) {
  revalidatePath(`/workspaces/${workspaceId}/studio`);
}

// ── Project actions ───────────────────────────────────────────────────────────

export async function createProjectAction(workspaceId: string, name: string) {
  const actor = await requireUser();
  const p = await createProject(actor, workspaceId, name);
  revalidatePath(`/workspaces/${workspaceId}/studio`);
  return p.id;
}

export async function renameProjectAction(workspaceId: string, projectId: string, name: string) {
  const actor = await requireUser();
  await renameProject(actor, projectId, name);
  rv(workspaceId);
}

export async function deleteProjectAction(workspaceId: string, projectId: string) {
  const actor = await requireUser();
  await deleteProject(actor, projectId);
  rv(workspaceId);
}

// ── Batch actions ─────────────────────────────────────────────────────────────

export async function createBatchAction(workspaceId: string, projectId: string, name: string) {
  const actor = await requireUser();
  const b = await createBatch(actor, projectId, name);
  rv(workspaceId);
  return b.id;
}

export async function renameBatchAction(workspaceId: string, batchId: string, name: string) {
  const actor = await requireUser();
  await renameBatch(actor, batchId, name);
  rv(workspaceId);
}

export async function deleteBatchAction(workspaceId: string, batchId: string) {
  const actor = await requireUser();
  await deleteBatch(actor, batchId);
  rv(workspaceId);
}

// ── Asset upload actions ──────────────────────────────────────────────────────

export async function uploadImagesAction(workspaceId: string, projectId: string, formData: FormData, batchId?: string) {
  const actor = await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    await createAsset(actor, projectId, f.name, buf, batchId);
  }
  rv(workspaceId);
}

export async function uploadVideosAction(workspaceId: string, projectId: string, formData: FormData, batchId?: string) {
  const actor = await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    assertVideoSize(buf, f.name);
    await createAsset(actor, projectId, f.name, buf, batchId);
  }
  rv(workspaceId);
}

// ── Cell creation actions ─────────────────────────────────────────────────────

export async function createCellAction(workspaceId: string, projectId: string, startAssetId: string, batchId?: string) {
  const actor = await requireUser();
  await createCell(actor, projectId, startAssetId, batchId);
  rv(workspaceId);
}

export async function createMotionCellAction(
  workspaceId: string,
  projectId: string,
  imageAssetId: string,
  videoAssetId: string,
  batchId?: string,
) {
  const actor = await requireUser();
  await createMotionCell(actor, projectId, imageAssetId, videoAssetId, batchId);
  rv(workspaceId);
}

export async function createAvatarCellAction(workspaceId: string, projectId: string, batchId?: string) {
  const actor = await requireUser();
  await createAvatarCell(actor, projectId, batchId);
  rv(workspaceId);
}

// ── Cell edit actions ─────────────────────────────────────────────────────────

export async function updateCellAction(
  workspaceId: string,
  jobId: string,
  patch: {
    prompt?: string;
    modelName?: string;
    mode?: "std" | "pro" | "4k";
    duration?: string;
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

export async function updateMotionCellAction(
  workspaceId: string,
  jobId: string,
  patch: {
    prompt?: string;
    modelName?: string;
    mode?: "std" | "pro";
    characterOrientation?: "image" | "video";
    keepOriginalSound?: "yes" | "no";
    imageAssetId?: string | null;
    videoAssetId?: string | null;
  },
) {
  const actor = await requireUser();
  await updateMotionCell(actor, jobId, patch);
  rv(workspaceId);
}

export async function updateAvatarCellAction(
  workspaceId: string,
  jobId: string,
  patch: {
    avatarId?: string;
    avatarType?: "2d" | "3d";
    voiceId?: string;
    voiceLanguage?: string;
    voiceSpeed?: number;
    avatarText?: string;
    prompt?: string;
    modelName?: string;
  },
) {
  const actor = await requireUser();
  await updateAvatarCell(actor, jobId, patch);
  rv(workspaceId);
}

export async function convertCellAction(
  workspaceId: string,
  jobId: string,
  newType: "image2video" | "motioncontrol" | "avatar",
) {
  const actor = await requireUser();
  await convertCellType(actor, jobId, newType);
  rv(workspaceId);
}

// ── Bulk actions ──────────────────────────────────────────────────────────────

export async function generateAllAction(workspaceId: string, projectId: string, batchId?: string) {
  const actor = await requireUser();
  const cells = await listCells(actor, projectId, batchId);
  for (const c of cells) {
    if (c.status === "draft" || c.status === "succeeded" || c.status === "failed") {
      await generateCell(actor, c.id);
    }
  }
  rv(workspaceId);
}

export async function deleteMultipleCellsAction(workspaceId: string, jobIds: string[]) {
  const actor = await requireUser();
  for (const id of jobIds) {
    await deleteCell(actor, id);
  }
  rv(workspaceId);
}

export async function generateMultipleCellsAction(workspaceId: string, jobIds: string[]) {
  const actor = await requireUser();
  for (const id of jobIds) {
    await generateCell(actor, id);
  }
  rv(workspaceId);
}

export async function updateMultipleCellsModeAction(
  workspaceId: string,
  updates: Array<{ id: string; type: string; mode: string }>,
) {
  const actor = await requireUser();
  for (const { id, type, mode } of updates) {
    if (type === "image2video") {
      await updateCell(actor, id, { mode: mode as "std" | "pro" | "4k" });
    } else if (type === "motioncontrol") {
      const mcMode = mode === "4k" ? "pro" : (mode as "std" | "pro");
      await updateMotionCell(actor, id, { mode: mcMode });
    }
  }
  rv(workspaceId);
}
