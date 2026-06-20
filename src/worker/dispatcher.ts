import { createKlingClient, KlingError, type Image2VideoParams, type LipSyncParams } from "@/lib/kling";
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
  if (!job) return false;
  const account = accounts.find((a) => a.id === chosen.id)!;
  const client = createKlingClient({ accessKey: account.accessKey, secretKey: account.secretKey });

  try {
    const task =
      job.type === "image2video"
        ? await client.createImage2Video(job.params as unknown as Image2VideoParams)
        : await client.createLipSync(job.params as unknown as LipSyncParams);
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
