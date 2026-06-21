import { createKlingClient, classifyKlingError, KlingError, type Image2VideoParams, type LipSyncParams, type MotionControlParams } from "@/lib/kling";
import { fileToBase64 } from "@/lib/uploads";
import { pickAccount, type AccountLoad } from "@/lib/queue-policy";
import { listEnabledAccountsDecrypted, setAccountEnabled } from "@/lib/kling-accounts";
import { getWorkspaceKeyForProject } from "@/lib/workspaces";
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
    };
    const params: Image2VideoParams = {
      image: await fileToBase64(p.imagePath),
      imageTail: p.endPath ? await fileToBase64(p.endPath) : undefined,
      prompt: p.prompt,
      modelName: p.modelName,
      mode: p.mode as "std" | "pro" | undefined,
      duration: p.duration,
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
    const params: MotionControlParams = {
      imageUrl: await fileToBase64(p.imagePath),
      videoUrl: await fileToBase64(p.videoPath),
      characterOrientation: p.characterOrientation ?? "image",
      mode: p.mode ?? "std",
      modelName: p.modelName,
      prompt: p.prompt,
      keepOriginalSound: p.keepOriginalSound,
    };
    return client.createMotionControl(params);
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

  // Prefer workspace-level API key over global pool.
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
