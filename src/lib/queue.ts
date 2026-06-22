import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import type { JobType, Job, Prisma } from "@prisma/client";
import { ForbiddenError } from "@/lib/workspaces";
import { canCreateProject, type Membership } from "@/lib/access";
import {
  clampOutputSlot,
  ensureOutputSlotIndex,
  firstEmptyOutputSlot,
  normalizeOutputSlots,
  normalizeSlotErrors,
  normalizeSlotStatuses,
  type OutputSlotStatus,
} from "@/lib/output-slots";

const MAX_IN_FLIGHT_PER_USER = Number(process.env.MAX_IN_FLIGHT_PER_USER ?? 10);

function jsonParams(value: unknown): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

async function membershipFor(workspaceId: string, userId: string): Promise<Membership> {
  return db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
}

/** Create a batch + queued jobs in a project. Caller must be able to create projects there. */
export async function enqueueJobs(
  actor: CurrentUser,
  projectId: string,
  type: JobType,
  source: string,
  paramsList: Array<Record<string, unknown>>,
) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  const membership =
    actor.role === "super_admin" ? null : await membershipFor(project.workspaceId, actor.id);
  if (!canCreateProject(actor.role, membership)) throw new ForbiddenError();
  if (paramsList.length === 0) throw new Error("No jobs to enqueue");

  return db.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: { projectId, createdById: actor.id, source, total: paramsList.length },
    });
    await tx.job.createMany({
      data: paramsList.map((params) => ({
        projectId,
        batchId: batch.id,
        createdById: actor.id,
        type,
        params: jsonParams(params),
      })),
    });
    return batch;
  });
}

/** In-flight (submitted+processing) job count for a user. */
export async function inFlightForUser(userId: string): Promise<number> {
  return db.job.count({
    where: { createdById: userId, status: { in: ["submitted", "processing"] } },
  });
}

/** In-flight count per Kling account (for the dispatcher). */
export async function inFlightByAccount(): Promise<Record<string, number>> {
  const rows = await db.job.groupBy({
    by: ["klingAccountId"],
    where: { status: { in: ["submitted", "processing"] }, klingAccountId: { not: null } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) if (r.klingAccountId) out[r.klingAccountId] = r._count._all;
  return out;
}

/**
 * Atomically claim one queued job whose owner is under the per-user cap, marking it
 * `submitted`. Uses FOR UPDATE SKIP LOCKED so concurrent workers never grab the same row.
 * Returns the claimed job id, or null if none claimable.
 */
export async function claimNextQueuedJob(): Promise<string | null> {
  const cap = MAX_IN_FLIGHT_PER_USER;
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    WITH next AS (
      SELECT j.id
      FROM "Job" j
      WHERE j.status = 'queued'::"JobStatus"
        AND (
          SELECT COUNT(*) FROM "Job" f
          WHERE f."createdById" = j."createdById"
            AND f.status IN ('submitted'::"JobStatus",'processing'::"JobStatus")
        ) < ${cap}
      ORDER BY j."createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "Job" SET status = 'submitted'::"JobStatus", "updatedAt" = NOW()
    WHERE id IN (SELECT id FROM next)
    RETURNING id;
  `;
  return rows[0]?.id ?? null;
}

export async function attachAccountAndTask(jobId: string, klingAccountId: string, klingTaskId: string) {
  await db.job.update({ where: { id: jobId }, data: { klingAccountId, klingTaskId } });
  await updateParentSlotFromRun(jobId, "submitted");
}

/** Attach only the Kling task ID (workspace-keyed jobs have no klingAccountId). */
export async function attachTaskOnly(jobId: string, klingTaskId: string) {
  await db.job.update({ where: { id: jobId }, data: { klingTaskId } });
  await updateParentSlotFromRun(jobId, "submitted");
}

/** Revert a claimed job to queued (e.g. submit failed / account unavailable). */
export async function requeueJob(jobId: string, error?: string) {
  await db.job.update({
    where: { id: jobId },
    data: { status: "queued", klingAccountId: null, klingTaskId: null, error: error ?? null, attempts: { increment: 1 } },
  });
  await updateParentSlotFromRun(jobId, "queued", undefined, error);
}

export async function getJob(jobId: string): Promise<Job | null> {
  return db.job.findUnique({ where: { id: jobId } });
}

/** Jobs currently submitted/processing (for the poller). */
export async function listActiveJobs(): Promise<Job[]> {
  return db.job.findMany({ where: { status: { in: ["submitted", "processing"] } } });
}

export async function markProcessing(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { status: "processing" } });
  await updateParentSlotFromRun(jobId, "processing");
}

export async function markSucceeded(jobId: string, resultUrl: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  if (job.parentJobId) {
    await db.job.update({
      where: { id: jobId },
      data: { status: "succeeded", resultUrl, error: null },
    });
    await updateParentSlotFromRun(jobId, "succeeded", resultUrl);
    return;
  }

  const params = { ...(job.params as Record<string, unknown>) };
  const slots = normalizeOutputSlots(
    Array.isArray(params.resultUrls) ? (params.resultUrls as (string | null)[]) : undefined,
  );

  const targetSlot = typeof params.targetSlot === "number"
    ? clampOutputSlot(params.targetSlot)
    : firstEmptyOutputSlot(slots);
  const statuses = normalizeSlotStatuses(
    Array.isArray(params.slotStatuses) ? (params.slotStatuses as string[]) : undefined,
    slots,
  );
  const errors = normalizeSlotErrors(
    Array.isArray(params.slotErrors) ? (params.slotErrors as (string | null)[]) : undefined,
  );
  ensureOutputSlotIndex(slots, statuses, errors, targetSlot);

  slots[targetSlot] = resultUrl;
  statuses[targetSlot] = "succeeded";
  errors[targetSlot] = null;
  params.resultUrls = slots;
  params.slotStatuses = statuses;
  params.slotErrors = errors;
  delete params.targetSlot;

  await db.job.update({
    where: { id: jobId },
    data: { status: "succeeded", resultUrl, error: null, params: jsonParams(params) },
  });
}

export async function markFailed(jobId: string, error: string) {
  await db.job.update({ where: { id: jobId }, data: { status: "failed", error } });
  await updateParentSlotFromRun(jobId, "failed", undefined, error);
}

/** All jobs in a project, newest first (for the project detail view). */
export async function listJobsForProject(projectId: string): Promise<Job[]> {
  return db.job.findMany({ where: { projectId, parentJobId: null }, orderBy: { createdAt: "desc" } });
}

async function updateParentSlotFromRun(
  slotRunId: string,
  status: OutputSlotStatus,
  resultUrl?: string,
  error?: string,
) {
  const slotRun = await db.job.findUnique({
    where: { id: slotRunId },
    select: { parentJobId: true, slotIndex: true },
  });
  if (!slotRun?.parentJobId || slotRun.slotIndex === null) return;

  const parent = await db.job.findUnique({
    where: { id: slotRun.parentJobId },
    select: { id: true, params: true, resultUrl: true },
  });
  if (!parent) return;

  const params = { ...(parent.params as Record<string, unknown>) };
  const slots = normalizeOutputSlots(
    Array.isArray(params.resultUrls) ? (params.resultUrls as (string | null)[]) : undefined,
    parent.resultUrl,
  );
  const statuses = normalizeSlotStatuses(
    Array.isArray(params.slotStatuses) ? (params.slotStatuses as string[]) : undefined,
    slots,
  );
  const errors = normalizeSlotErrors(
    Array.isArray(params.slotErrors) ? (params.slotErrors as (string | null)[]) : undefined,
  );
  const slot = clampOutputSlot(slotRun.slotIndex);
  ensureOutputSlotIndex(slots, statuses, errors, slot);

  statuses[slot] = status;
  if (status === "succeeded" && resultUrl) {
    slots[slot] = resultUrl;
    errors[slot] = null;
  } else if (status === "failed") {
    errors[slot] = error ?? "Kling task failed";
  } else if (error) {
    errors[slot] = error;
  } else if (status === "queued" || status === "submitted" || status === "processing") {
    errors[slot] = null;
  }

  params.resultUrls = slots;
  params.slotStatuses = statuses;
  params.slotErrors = errors;

  await db.job.update({
    where: { id: parent.id },
    data: {
      params: jsonParams(params),
      resultUrl: slots.find(Boolean) ?? null,
      error: errors.find(Boolean) ?? null,
    },
  });
}
