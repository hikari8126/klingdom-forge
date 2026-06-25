import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import type { Job, JobType, Prisma } from "@prisma/client";
import { getProjectForUser } from "@/lib/projects";
import { canCreateProject } from "@/lib/access";
import { ForbiddenError } from "@/lib/workspaces";
import { assetPath } from "@/lib/assets";
import {
  DEFAULT_KLING_VIDEO_RATIO,
  sanitizeKlingAvatarSettings,
  sanitizeKlingImageSettings,
  sanitizeKlingMotionSettings,
  type KlingImageMode,
  type KlingMotionMode,
  type KlingVideoRatio,
} from "@/lib/kling-options";
import {
  clampOutputSlot,
  ensureOutputSlotIndex,
  firstEmptyOutputSlot,
  normalizeOutputSlots,
  normalizeSlotErrors,
  normalizeSlotStatuses,
  type OutputSlotStatus,
} from "@/lib/output-slots";

function jsonParams(value: unknown): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

export type CellParams = {
  startAssetId?: string;
  imagePath?: string;
  endAssetId?: string;
  endPath?: string;
  prompt?: string;
  modelName: string;
  mode: KlingImageMode;
  duration: string; // "3".."15" for image2video; not used for avatar
  videoRatio?: KlingVideoRatio;
  nativeAudio?: boolean;
  multiShot?: boolean;
  // motioncontrol-only
  videoAssetId?: string;
  libraryVideoId?: string;
  videoPath?: string;
  characterOrientation?: "image" | "video";
  keepOriginalSound?: "yes" | "no";
  // avatar-only
  avatarAudioAssetId?: string;
  avatarAudioPath?: string;
  avatarAudioId?: string;
  avatarSoundUrl?: string;
  avatarId?: string;
  avatarType?: "2d" | "3d";
  voiceId?: string;
  voiceLanguage?: string;
  voiceSpeed?: number;
  avatarText?: string;
  // multi-output (unlimited results per cell; UI scrolls output slots)
  resultUrls?: (string | null)[];
  slotStatuses?: OutputSlotStatus[];
  slotErrors?: (string | null)[];
  targetSlot?: number;
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
    where: { projectId, parentJobId: null, ...(batchId !== undefined ? { batchId } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

/** Create a draft cell from a start-image asset. */
export async function createCell(actor: CurrentUser, projectId: string, startAssetId: string, batchId?: string) {
  await assertCanEdit(actor, projectId);
  const imagePath = await assetPath(startAssetId);
  if (!imagePath) throw new Error("Ảnh không tồn tại");
  const params: CellParams = {
    startAssetId,
    imagePath,
    modelName: "kling-v2-6",
    mode: "std",
    duration: "5",
    videoRatio: DEFAULT_KLING_VIDEO_RATIO,
    nativeAudio: false,
    multiShot: false,
  };
  return db.job.create({
    data: { projectId, batchId, createdById: actor.id, type: "image2video", status: "draft", params: jsonParams(params) },
  });
}

/** Patch a draft cell's settings/frames. `endAssetId` null clears the end frame. */
export async function updateCell(
  actor: CurrentUser,
  jobId: string,
  patch: {
    prompt?: string;
    modelName?: string;
    mode?: KlingImageMode;
    duration?: string;
    videoRatio?: KlingVideoRatio;
    nativeAudio?: boolean;
    multiShot?: boolean;
    startAssetId?: string | null;
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
  if (patch.videoRatio !== undefined) params.videoRatio = patch.videoRatio;
  if (patch.nativeAudio !== undefined) params.nativeAudio = patch.nativeAudio;
  if (patch.multiShot !== undefined) params.multiShot = patch.multiShot;
  if (patch.startAssetId !== undefined) {
    params.startAssetId = patch.startAssetId ?? undefined;
    params.imagePath = patch.startAssetId ? (await assetPath(patch.startAssetId)) ?? params.imagePath : undefined;
  }
  if (patch.endAssetId !== undefined) {
    params.endAssetId = patch.endAssetId ?? undefined;
    params.endPath = patch.endAssetId ? (await assetPath(patch.endAssetId)) ?? undefined : undefined;
  }
  Object.assign(params, sanitizeKlingImageSettings(params));
  return db.job.update({ where: { id: jobId }, data: { params: jsonParams(params) } });
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
      params: (() => {
        const p = { ...(job.params as Record<string, unknown>) };
        delete p.resultUrls;
        delete p.slotStatuses;
        delete p.slotErrors;
        delete p.targetSlot;
        return jsonParams(p);
      })(),
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
  return db.job.update({ where: { id: jobId }, data: { params: jsonParams(params) } });
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
    data: { projectId, batchId, createdById: actor.id, type: "motioncontrol", status: "draft", params: jsonParams(params) },
  });
}

/** Update fields on a motion control cell. */
export async function updateMotionCell(
  actor: CurrentUser,
  jobId: string,
  patch: {
    prompt?: string;
    modelName?: string;
    mode?: KlingMotionMode;
    characterOrientation?: "image" | "video";
    keepOriginalSound?: "yes" | "no";
    imageAssetId?: string | null;
    videoAssetId?: string | null;
    libraryVideoId?: string | null;
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
  if (patch.libraryVideoId !== undefined) {
    if (patch.libraryVideoId !== null) {
      const libVid = await db.libraryVideo.findUnique({ where: { id: patch.libraryVideoId }, select: { storedPath: true } });
      if (libVid?.storedPath) {
        params.libraryVideoId = patch.libraryVideoId;
        params.videoPath = libVid.storedPath;
        params.videoAssetId = undefined;
      }
    } else {
      params.libraryVideoId = undefined;
      if (!params.videoAssetId) params.videoPath = undefined;
    }
  }
  if (patch.videoAssetId !== undefined) {
    if (patch.videoAssetId !== null) {
      params.videoAssetId = patch.videoAssetId;
      params.libraryVideoId = undefined;
      params.videoPath = (await assetPath(patch.videoAssetId)) ?? params.videoPath;
    } else {
      params.videoAssetId = undefined;
      if (!params.libraryVideoId) params.videoPath = undefined;
    }
  }
  Object.assign(params, sanitizeKlingMotionSettings(params));
  return db.job.update({ where: { id: jobId }, data: { params: jsonParams(params) } });
}

/** Create a blank Avatar cell. */
export async function createAvatarCell(actor: CurrentUser, projectId: string, batchId?: string) {
  await assertCanEdit(actor, projectId);
  const params: CellParams = {
    modelName: "kling-v2-6",
    mode: "std",
    duration: "5",
    avatarAudioId: "",
    avatarSoundUrl: "",
    avatarId: "",
    avatarType: "2d",
    voiceId: "",
    voiceLanguage: "en",
    voiceSpeed: 1.0,
    avatarText: "",
    prompt: "",
  };
  return db.job.create({
    data: { projectId, batchId, createdById: actor.id, type: "avatar", status: "draft", params: jsonParams(params) },
  });
}

/** Update avatar-specific fields. */
export async function updateAvatarCell(
  actor: CurrentUser,
  jobId: string,
  patch: {
    avatarId?: string;
    avatarType?: "2d" | "3d";
    imageAssetId?: string | null;
    avatarAudioAssetId?: string | null;
    avatarAudioId?: string;
    avatarSoundUrl?: string;
    voiceId?: string;
    voiceLanguage?: string;
    voiceSpeed?: number;
    avatarText?: string;
    prompt?: string;
    modelName?: string;
    mode?: KlingMotionMode;
  },
) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  const params = { ...(job.params as CellParams) };
  if (patch.imageAssetId !== undefined) {
    params.startAssetId = patch.imageAssetId ?? undefined;
    params.imagePath = patch.imageAssetId ? (await assetPath(patch.imageAssetId)) ?? undefined : undefined;
  }
  if (patch.avatarAudioAssetId !== undefined) {
    if (patch.avatarAudioAssetId) {
      params.avatarAudioAssetId = patch.avatarAudioAssetId;
      params.avatarAudioPath = (await assetPath(patch.avatarAudioAssetId)) ?? undefined;
      params.avatarAudioId = "";
      params.avatarSoundUrl = "";
    } else {
      params.avatarAudioAssetId = undefined;
      params.avatarAudioPath = undefined;
    }
  }
  if (patch.avatarAudioId !== undefined) {
    params.avatarAudioId = patch.avatarAudioId;
    if (patch.avatarAudioId.trim()) {
      params.avatarAudioAssetId = undefined;
      params.avatarAudioPath = undefined;
      params.avatarSoundUrl = "";
    }
  }
  if (patch.avatarSoundUrl !== undefined) {
    params.avatarSoundUrl = patch.avatarSoundUrl;
    if (patch.avatarSoundUrl.trim()) {
      params.avatarAudioAssetId = undefined;
      params.avatarAudioPath = undefined;
      params.avatarAudioId = "";
    }
  }
  if (patch.avatarId !== undefined) params.avatarId = patch.avatarId;
  if (patch.avatarType !== undefined) params.avatarType = patch.avatarType;
  if (patch.voiceId !== undefined) params.voiceId = patch.voiceId;
  if (patch.voiceLanguage !== undefined) params.voiceLanguage = patch.voiceLanguage;
  if (patch.voiceSpeed !== undefined) params.voiceSpeed = patch.voiceSpeed;
  if (patch.avatarText !== undefined) params.avatarText = patch.avatarText;
  if (patch.prompt !== undefined) params.prompt = patch.prompt;
  if (patch.modelName !== undefined) params.modelName = patch.modelName;
  if (patch.mode !== undefined) params.mode = patch.mode;
  Object.assign(params, sanitizeKlingAvatarSettings(params));
  return db.job.update({ where: { id: jobId }, data: { params: jsonParams(params) } });
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
  const preservedSlots = normalizeOutputSlots(
    Array.isArray(old.resultUrls) ? old.resultUrls : undefined,
    job.resultUrl,
  );
  const preservedStatuses = normalizeSlotStatuses(old.slotStatuses, preservedSlots);
  const preservedErrors = normalizeSlotErrors(old.slotErrors);
  let params: CellParams = {
    modelName: old.modelName || "kling-v2-6",
    mode: old.mode || "std",
    duration: old.duration || "5",
    videoRatio: old.videoRatio ?? DEFAULT_KLING_VIDEO_RATIO,
    nativeAudio: old.nativeAudio ?? false,
    multiShot: old.multiShot ?? false,
    prompt: old.prompt,
    resultUrls: preservedSlots,
    slotStatuses: preservedStatuses,
    slotErrors: preservedErrors,
  };

  if (newType === "image2video") {
    params = {
      ...params,
      ...sanitizeKlingImageSettings(params),
      startAssetId: old.startAssetId,
      imagePath: old.imagePath,
    };
  } else if (newType === "motioncontrol") {
    params = {
      ...params,
      startAssetId: old.startAssetId,
      imagePath: old.imagePath,
      videoAssetId: old.videoAssetId,
      videoPath: old.videoPath,
      ...sanitizeKlingMotionSettings(old),
    };
  } else {
    params = {
      ...params,
      mode: sanitizeKlingAvatarSettings(old).mode,
      startAssetId: old.startAssetId,
      imagePath: old.imagePath,
      avatarAudioAssetId: old.avatarAudioAssetId,
      avatarAudioPath: old.avatarAudioPath,
      avatarAudioId: old.avatarAudioId ?? "",
      avatarSoundUrl: old.avatarSoundUrl ?? "",
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
    data: { type: newType, status: "draft", error: job.error, resultUrl: job.resultUrl, klingAccountId: null, klingTaskId: null, params: jsonParams(params) },
  });
}

/** Generate: create a queued slot-run job. The parent cell stays editable/clickable,
 *  so users can fire multiple slots concurrently. */
export async function generateCell(actor: CurrentUser, jobId: string, targetSlot?: number) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  if (job.parentJobId) throw new Error("Không thể generate trực tiếp slot-run job");
  await assertCanEdit(actor, job.projectId);

  return db.$transaction(async (tx) => {
    // Lock the parent row before selecting a slot. This lets users click/post
    // generate repeatedly at the same time without two requests claiming the
    // same slot from a stale copy of params.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Job" WHERE id = ${jobId} FOR UPDATE
    `;
    if (!locked[0]) throw new Error("Cell không tồn tại");

    const current = await tx.job.findUnique({ where: { id: jobId } });
    if (!current) throw new Error("Cell không tồn tại");
    if (current.parentJobId) throw new Error("Không thể generate trực tiếp slot-run job");

    const params = { ...(current.params as CellParams) };
    const slots = normalizeOutputSlots(
      Array.isArray(params.resultUrls) ? params.resultUrls : undefined,
      current.resultUrl,
    );
    const statuses = normalizeSlotStatuses(params.slotStatuses, slots);
    const errors = normalizeSlotErrors(params.slotErrors);

    const slot =
      targetSlot !== undefined
        ? clampOutputSlot(targetSlot)
        : firstEmptyOutputSlot(slots, statuses);
    ensureOutputSlotIndex(slots, statuses, errors, slot);

    params.resultUrls = slots;
    statuses[slot] = "queued";
    errors[slot] = null;
    params.slotStatuses = statuses;
    params.slotErrors = errors;
    delete params.targetSlot;

    const childParams: Record<string, unknown> = {
      ...params,
      parentCellId: current.id,
      targetSlot: slot,
      isSlotRun: true,
    };
    delete childParams.resultUrls;
    delete childParams.slotStatuses;
    delete childParams.slotErrors;

    const slotRun = await tx.job.create({
      data: {
        projectId: current.projectId,
        batchId: current.batchId ?? undefined,
        createdById: actor.id,
        type: current.type as JobType,
        status: "queued",
        parentJobId: current.id,
        slotIndex: slot,
        params: jsonParams(childParams),
      },
    });
    await tx.job.update({
      where: { id: current.id },
      data: { status: "draft", error: null, params: jsonParams(params) },
    });
    return slotRun;
  });
}
