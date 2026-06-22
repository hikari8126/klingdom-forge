import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import type { Job } from "@prisma/client";
import { getProjectForUser } from "@/lib/projects";
import { canCreateProject } from "@/lib/access";
import { ForbiddenError } from "@/lib/workspaces";
import { assetPath } from "@/lib/assets";

export type CellParams = {
  startAssetId?: string;
  imagePath?: string;
  endAssetId?: string;
  endPath?: string;
  prompt?: string;
  modelName: string;
  mode: "std" | "pro" | "4k";
  duration: string; // "3".."15" for image2video; not used for avatar
  // motioncontrol-only
  videoAssetId?: string;
  videoPath?: string;
  characterOrientation?: "image" | "video";
  keepOriginalSound?: "yes" | "no";
  // avatar-only
  avatarId?: string;
  avatarType?: "2d" | "3d";
  voiceId?: string;
  voiceLanguage?: string;
  voiceSpeed?: number;
  avatarText?: string;
};

async function assertCanEdit(actor: CurrentUser, projectId: string) {
  const access = await getProjectForUser(actor, projectId);
  if (!access || !canCreateProject(actor.role, access.membership)) throw new ForbiddenError();
}

/** All cells (jobs of any status, incl. draft) in a project/batch, oldest first. */
export async function listCells(actor: CurrentUser, projectId: string, batchId?: string): Promise<Job[]> {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  return db.job.findMany({
    where: { projectId, ...(batchId !== undefined ? { batchId } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

/** Create a draft cell from a start-image asset. */
export async function createCell(actor: CurrentUser, projectId: string, startAssetId: string, batchId?: string) {
  await assertCanEdit(actor, projectId);
  const imagePath = await assetPath(startAssetId);
  if (!imagePath) throw new Error("Ảnh không tồn tại");
  const params: CellParams = { startAssetId, imagePath, modelName: "kling-v2-6", mode: "std", duration: "5" };
  return db.job.create({
    data: { projectId, batchId, createdById: actor.id, type: "image2video", status: "draft", params: params as object },
  });
}

/** Patch a draft cell's settings/frames. `endAssetId` null clears the end frame. */
export async function updateCell(
  actor: CurrentUser,
  jobId: string,
  patch: {
    prompt?: string;
    modelName?: string;
    mode?: "std" | "pro" | "4k";
    duration?: string;
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

/** Swap the start and end frames of a cell (no-op if there is no end frame). */
export async function swapFrames(actor: CurrentUser, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  const p = { ...(job.params as CellParams) };
  if (!p.endAssetId || !p.endPath) return job;
  const params: CellParams = {
    ...p,
    startAssetId: p.endAssetId,
    imagePath: p.endPath,
    endAssetId: p.startAssetId,
    endPath: p.imagePath,
  };
  return db.job.update({ where: { id: jobId }, data: { params: params as object } });
}

/** Create a draft Motion Control cell (requires both an image and a video asset). */
export async function createMotionCell(
  actor: CurrentUser,
  projectId: string,
  imageAssetId: string,
  videoAssetId: string,
  batchId?: string,
) {
  await assertCanEdit(actor, projectId);
  const imagePath = await assetPath(imageAssetId);
  if (!imagePath) throw new Error("Ảnh tham chiếu không tồn tại");
  const videoPath = await assetPath(videoAssetId);
  if (!videoPath) throw new Error("Video chuyển động không tồn tại");
  const params: CellParams = {
    startAssetId: imageAssetId,
    imagePath,
    videoAssetId,
    videoPath,
    characterOrientation: "image",
    keepOriginalSound: "yes",
    modelName: "kling-v2-6",
    mode: "std",
    duration: "5",
  };
  return db.job.create({
    data: { projectId, batchId, createdById: actor.id, type: "motioncontrol", status: "draft", params: params as object },
  });
}

/** Update fields on a motion control cell. */
export async function updateMotionCell(
  actor: CurrentUser,
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
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  const params = { ...(job.params as CellParams) };
  if (patch.prompt !== undefined) params.prompt = patch.prompt;
  if (patch.modelName !== undefined) params.modelName = patch.modelName;
  if (patch.mode !== undefined) params.mode = patch.mode;
  if (patch.characterOrientation !== undefined) params.characterOrientation = patch.characterOrientation;
  if (patch.keepOriginalSound !== undefined) params.keepOriginalSound = patch.keepOriginalSound;
  if (patch.imageAssetId !== undefined) {
    params.startAssetId = patch.imageAssetId ?? params.startAssetId;
    params.imagePath = patch.imageAssetId ? (await assetPath(patch.imageAssetId)) ?? params.imagePath : params.imagePath;
  }
  if (patch.videoAssetId !== undefined && patch.videoAssetId !== null) {
    params.videoAssetId = patch.videoAssetId;
    params.videoPath = (await assetPath(patch.videoAssetId)) ?? params.videoPath;
  }
  return db.job.update({ where: { id: jobId }, data: { params: params as object } });
}

/** Create a blank Avatar cell. */
export async function createAvatarCell(actor: CurrentUser, projectId: string, batchId?: string) {
  await assertCanEdit(actor, projectId);
  const params: CellParams = {
    modelName: "kling-v2-6",
    mode: "std",
    duration: "5",
    avatarId: "",
    avatarType: "2d",
    voiceId: "",
    voiceLanguage: "en",
    voiceSpeed: 1.0,
    avatarText: "",
    prompt: "",
  };
  return db.job.create({
    data: { projectId, batchId, createdById: actor.id, type: "avatar", status: "draft", params: params as object },
  });
}

/** Update avatar-specific fields. */
export async function updateAvatarCell(
  actor: CurrentUser,
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
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  const params = { ...(job.params as CellParams) };
  if (patch.avatarId !== undefined) params.avatarId = patch.avatarId;
  if (patch.avatarType !== undefined) params.avatarType = patch.avatarType;
  if (patch.voiceId !== undefined) params.voiceId = patch.voiceId;
  if (patch.voiceLanguage !== undefined) params.voiceLanguage = patch.voiceLanguage;
  if (patch.voiceSpeed !== undefined) params.voiceSpeed = patch.voiceSpeed;
  if (patch.avatarText !== undefined) params.avatarText = patch.avatarText;
  if (patch.prompt !== undefined) params.prompt = patch.prompt;
  if (patch.modelName !== undefined) params.modelName = patch.modelName;
  return db.job.update({ where: { id: jobId }, data: { params: params as object } });
}

/** Convert a cell to a different type, preserving common fields and resetting type-specific ones. */
export async function convertCellType(
  actor: CurrentUser,
  jobId: string,
  newType: "image2video" | "motioncontrol" | "avatar",
) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);

  const old = job.params as CellParams;
  let params: CellParams = {
    modelName: old.modelName || "kling-v2-6",
    mode: old.mode || "std",
    duration: old.duration || "5",
    prompt: old.prompt,
  };

  if (newType === "image2video") {
    params = { ...params, startAssetId: old.startAssetId, imagePath: old.imagePath };
  } else if (newType === "motioncontrol") {
    params = {
      ...params,
      startAssetId: old.startAssetId,
      imagePath: old.imagePath,
      videoAssetId: old.videoAssetId,
      videoPath: old.videoPath,
      characterOrientation: old.characterOrientation ?? "image",
      keepOriginalSound: old.keepOriginalSound ?? "yes",
    };
  } else {
    params = {
      ...params,
      avatarId: old.avatarId ?? "",
      avatarType: old.avatarType ?? "2d",
      voiceId: old.voiceId ?? "",
      voiceLanguage: old.voiceLanguage ?? "en",
      voiceSpeed: old.voiceSpeed ?? 1.0,
      avatarText: old.avatarText ?? old.prompt ?? "",
    };
  }

  return db.job.update({
    where: { id: jobId },
    data: { type: newType, status: "draft", error: null, resultUrl: null, klingAccountId: null, klingTaskId: null, params: params as object },
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
