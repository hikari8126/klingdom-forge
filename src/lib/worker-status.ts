import { db } from "@/lib/db";

/** True if the background worker wrote a heartbeat within `thresholdMs` (default 15s). */
export async function isWorkerOnline(thresholdMs = 15000): Promise<boolean> {
  const s = await db.workerStatus.findUnique({ where: { id: "singleton" } });
  if (!s) return false;
  return Date.now() - s.beatAt.getTime() < thresholdMs;
}
