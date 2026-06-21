import { createKlingClient, KlingError } from "@/lib/kling";
import { listEnabledAccountsDecrypted } from "@/lib/kling-accounts";
import { getWorkspaceKeyForProject } from "@/lib/workspaces";
import { listActiveJobs, markProcessing, markSucceeded, markFailed } from "@/lib/queue";

/** One poll tick: advance each active job by querying Kling. */
export async function pollOnce(): Promise<void> {
  const jobs = await listActiveJobs();
  if (jobs.length === 0) return;
  const accounts = await listEnabledAccountsDecrypted();
  const byId = new Map(accounts.map((a) => [a.id, a]));

  for (const job of jobs) {
    if (!job.klingTaskId) continue;

    let client: ReturnType<typeof createKlingClient>;

    if (job.klingAccountId) {
      const account = byId.get(job.klingAccountId);
      if (!account) continue;
      client = createKlingClient({ accessKey: account.accessKey, secretKey: account.secretKey });
    } else {
      // Workspace-keyed job — look up API key via project.
      const wsKey = await getWorkspaceKeyForProject(job.projectId);
      if (!wsKey) continue;
      client = createKlingClient({ accessKey: wsKey.accessKey });
    }

    const kind = job.type === "image2video" ? "image2video" : job.type === "motioncontrol" ? "motion-control" : "lip-sync";
    try {
      const task = await client.getTask(kind, job.klingTaskId);
      if (task.status === "succeed" && task.videoUrl) {
        await markSucceeded(job.id, task.videoUrl);
      } else if (task.status === "failed") {
        await markFailed(job.id, task.statusMessage ?? "Kling task failed");
      } else if (task.status === "processing" && job.status !== "processing") {
        await markProcessing(job.id);
      }
    } catch (e) {
      if (e instanceof KlingError) continue;
      continue;
    }
  }
}
