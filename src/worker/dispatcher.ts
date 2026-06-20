import { createKlingClient, KlingError, type Image2VideoParams, type LipSyncParams } from "@/lib/kling";
import { fileToBase64 } from "@/lib/uploads";
import { pickAccount, type AccountLoad } from "@/lib/queue-policy";
import { listEnabledAccountsDecrypted, setAccountEnabled } from "@/lib/kling-accounts";
import {
  claimNextQueuedJob,
  inFlightByAccount,
  attachAccountAndTask,
  requeueJob,
  getJob,
} from "@/lib/queue";

const SYSTEM_ACTOR = { id: "system", email: "", name: null, image: null, role: "super_admin" as const };

/** One dispatch tick: claim a queued job and submit it to a free account. Returns true if it did work. */
export async function dispatchOnce(): Promise<boolean> {
  const accounts = await listEnabledAccountsDecrypted();
  if (accounts.length === 0) return false;

  const inFlight = await inFlightByAccount();
  const loads: AccountLoad[] = accounts.map((a) => ({
    id: a.id,
    maxConcurrent: a.maxConcurrent,
    inFlight: inFlight[a.id] ?? 0,
  }));
  const chosen = pickAccount(loads);
  if (!chosen) return false;

  const jobId = await claimNextQueuedJob();
  if (!jobId) return false;

  const job = await getJob(jobId);
  // Row vanished between claim and read (e.g. project/batch cascade-deleted) —
  // there's nothing to requeue; keep draining the queue.
  if (!job) return true;
  const account = accounts.find((a) => a.id === chosen.id)!;
  const client = createKlingClient({ accessKey: account.accessKey, secretKey: account.secretKey });

  try {
    let task;
    if (job.type === "image2video") {
      const p = job.params as {
        imagePath: string;
        endPath?: string;
        prompt?: string;
        modelName?: string;
        mode?: "std" | "pro";
        duration?: "5" | "10";
      };
      const params: Image2VideoParams = {
        image: await fileToBase64(p.imagePath),
        imageTail: p.endPath ? await fileToBase64(p.endPath) : undefined,
        prompt: p.prompt,
        modelName: p.modelName,
        mode: p.mode,
        duration: p.duration,
      };
      task = await client.createImage2Video(params);
    } else {
      task = await client.createLipSync(job.params as unknown as LipSyncParams);
    }
    await attachAccountAndTask(jobId, account.id, task.taskId);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof KlingError && (e.code === 1000 || e.code === 1101 || e.code === 1102 || e.code === 1103)) {
      await setAccountEnabled(SYSTEM_ACTOR, account.id, false);
    }
    await requeueJob(jobId, msg);
    return true;
  }
}
