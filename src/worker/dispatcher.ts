import { createKlingClient, classifyKlingError, KlingError, type AvatarParams, type Image2VideoParams, type LipSyncParams, type MotionControlParams } from "@/lib/kling";
import { fileToBase64 } from "@/lib/uploads";
import { pickAccount, type AccountLoad } from "@/lib/queue-policy";
import { listEnabledAccountsDecrypted, setAccountEnabled, getAssignedAccountForProject } from "@/lib/kling-accounts";
import { getWorkspaceKeyForProject } from "@/lib/workspaces";
import { canUseKlingNativeAudio, getKlingImageCapabilities, sanitizeKlingAvatarSettings, sanitizeKlingImageSettings, sanitizeKlingMotionSettings, type KlingVideoRatio } from "@/lib/kling-options";
import {
  claimNextQueuedJob,
  inFlightByAccount,
  attachAccountAndTask,
  attachTaskOnly,
  requeueJob,
  markFailed,
  getJob,
} from "@/lib/queue";

/** Max submit attempts for a transient error before the job is failed. */
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS ?? 4);

const SYSTEM_ACTOR = { id: "system", email: "", name: null, image: null, role: "super_admin" as const };

async function buildTask(client: ReturnType<typeof createKlingClient>, job: NonNullable<Awaited<ReturnType<typeof getJob>>>) {
  if (job.type === "image2video") {
    const p = job.params as {
      imagePath: string;
      endPath?: string;
      prompt?: string;
      modelName?: string;
      mode?: "std" | "pro" | "4k";
      duration?: string;
      videoRatio?: KlingVideoRatio;
      nativeAudio?: boolean;
      multiShot?: boolean;
    };
    const safe = sanitizeKlingImageSettings(p);
    const caps = getKlingImageCapabilities(safe.modelName);
    const params: Image2VideoParams = {
      image: await fileToBase64(p.imagePath),
      imageTail: p.endPath ? await fileToBase64(p.endPath) : undefined,
      prompt: p.prompt,
      modelName: safe.modelName,
      mode: safe.mode,
      duration: safe.duration,
      aspectRatio: caps.supportsVideoRatio ? safe.videoRatio : undefined,
      sound: canUseKlingNativeAudio(safe.modelName, safe.mode) ? (safe.nativeAudio ? "on" : "off") : undefined,
      multiShot: safe.multiShot ? true : undefined,
      shotType: safe.multiShot ? "intelligence" : undefined,
    };
    return client.createImage2Video(params);
  } else if (job.type === "motioncontrol") {
    const p = job.params as {
      imagePath: string;
      videoPath?: string;
      characterOrientation?: "image" | "video";
      keepOriginalSound?: "yes" | "no";
      mode?: "std" | "pro";
      modelName?: string;
      prompt?: string;
    };
    if (!p.videoPath) throw new Error("Motion control cell thiếu video tham chiếu");
    const safe = sanitizeKlingMotionSettings(p);
    const params: MotionControlParams = {
      imageUrl: await fileToBase64(p.imagePath),
      videoUrl: await fileToBase64(p.videoPath),
      characterOrientation: safe.characterOrientation,
      mode: safe.mode,
      modelName: safe.modelName,
      prompt: p.prompt,
      keepOriginalSound: safe.keepOriginalSound,
    };
    return client.createMotionControl(params);
  } else if (job.type === "avatar") {
    const p = job.params as {
      imagePath?: string;
      avatarAudioPath?: string;
      avatarAudioId?: string;
      avatarSoundUrl?: string;
      avatarText?: string;
      prompt?: string;
      mode?: "std" | "pro";
    };
    if (!p.imagePath) throw new Error("Avatar cell thiếu ảnh tham chiếu");
    const audioId = p.avatarAudioId?.trim();
    const soundUrl = p.avatarSoundUrl?.trim();
    const soundFile = p.avatarAudioPath ? await fileToBase64(p.avatarAudioPath) : soundUrl || undefined;
    if (!audioId && !soundFile) throw new Error("Avatar cell thiếu audio_id hoặc sound_file");
    const safe = sanitizeKlingAvatarSettings(p);
    const params: AvatarParams = {
      image: await fileToBase64(p.imagePath),
      audioId: audioId || undefined,
      soundFile: audioId ? undefined : soundFile,
      prompt: p.prompt || p.avatarText || undefined,
      mode: safe.mode,
    };
    return client.createAvatar(params);
  } else {
    return client.createLipSync(job.params as unknown as LipSyncParams);
  }
}

/** One dispatch tick: claim a queued job and submit it to a free account. Returns true if it did work. */
export async function dispatchOnce(): Promise<boolean> {
  // Get global accounts for capacity check (used as fallback when workspace has no key).
  const accounts = await listEnabledAccountsDecrypted();
  const inFlight = await inFlightByAccount();
  const loads: AccountLoad[] = accounts.map((a) => ({
    id: a.id,
    maxConcurrent: a.maxConcurrent,
    inFlight: inFlight[a.id] ?? 0,
  }));
  const chosen = pickAccount(loads);

  // Only claim if there's a global account with capacity OR we'll check workspace key after claiming.
  // We always attempt to claim so workspace-keyed jobs aren't blocked by global pool capacity.
  const jobId = await claimNextQueuedJob();
  if (!jobId) return false;

  const job = await getJob(jobId);
  // Row vanished between claim and read (e.g. project/batch cascade-deleted).
  if (!job) return true;

  // Highest priority: a Kling key explicitly assigned to this job's workspace.
  const assigned = await getAssignedAccountForProject(job.projectId);
  if (assigned) {
    const client = createKlingClient({ accessKey: assigned.accessKey, secretKey: assigned.secretKey });
    try {
      const task = await buildTask(client, job);
      await attachAccountAndTask(jobId, assigned.id, task.taskId);
      return true;
    } catch (e) {
      const baseMsg = e instanceof Error ? e.message : String(e);
      const code = e instanceof KlingError && typeof e.code === "number" ? e.code : undefined;
      const msg = code !== undefined ? `${baseMsg} [Kling ${code}]` : baseMsg;
      const cls = classifyKlingError(e);
      if (cls === "account") {
        await setAccountEnabled(SYSTEM_ACTOR, assigned.id, false);
        await requeueJob(jobId, `Khoá/Account "${assigned.label}" lỗi: ${msg}`);
      } else if (cls === "fatal") {
        await markFailed(jobId, msg);
      } else if ((job.attempts ?? 0) + 1 >= MAX_ATTEMPTS) {
        await markFailed(jobId, `Đã thử ${MAX_ATTEMPTS} lần, vẫn lỗi: ${msg}`);
      } else {
        await requeueJob(jobId, msg);
      }
      return true;
    }
  }

  // Next: a workspace-level raw API key (legacy free-text).
  const wsKey = await getWorkspaceKeyForProject(job.projectId);

  if (wsKey) {
    const client = createKlingClient({ accessKey: wsKey.accessKey });
    try {
      const task = await buildTask(client, job);
      await attachTaskOnly(jobId, task.taskId);
      return true;
    } catch (e) {
      const baseMsg = e instanceof Error ? e.message : String(e);
      const code = e instanceof KlingError && typeof e.code === "number" ? e.code : undefined;
      const msg = code !== undefined ? `${baseMsg} [Kling ${code}]` : baseMsg;
      const cls = classifyKlingError(e);
      if (cls === "fatal") {
        await markFailed(jobId, msg);
      } else if ((job.attempts ?? 0) + 1 >= MAX_ATTEMPTS) {
        await markFailed(jobId, `Đã thử ${MAX_ATTEMPTS} lần, vẫn lỗi: ${msg}`);
      } else {
        await requeueJob(jobId, msg);
      }
      return true;
    }
  }

  // Fall back to global account pool.
  if (!chosen) {
    await requeueJob(jobId, "Không có account nào còn slot — sẽ thử lại sau");
    return true;
  }

  const account = accounts.find((a) => a.id === chosen.id)!;
  const client = createKlingClient({ accessKey: account.accessKey, secretKey: account.secretKey });

  try {
    const task = await buildTask(client, job);
    await attachAccountAndTask(jobId, account.id, task.taskId);
    return true;
  } catch (e) {
    const baseMsg = e instanceof Error ? e.message : String(e);
    const code = e instanceof KlingError && typeof e.code === "number" ? e.code : undefined;
    const msg = code !== undefined ? `${baseMsg} [Kling ${code}]` : baseMsg;
    const cls = classifyKlingError(e);
    if (cls === "account") {
      await setAccountEnabled(SYSTEM_ACTOR, account.id, false);
      await requeueJob(jobId, `Khoá/Account "${account.label}" lỗi: ${msg}`);
    } else if (cls === "fatal") {
      await markFailed(jobId, msg);
    } else {
      if ((job.attempts ?? 0) + 1 >= MAX_ATTEMPTS) {
        await markFailed(jobId, `Đã thử ${MAX_ATTEMPTS} lần, vẫn lỗi: ${msg}`);
      } else {
        await requeueJob(jobId, msg);
      }
    }
    return true;
  }
}
