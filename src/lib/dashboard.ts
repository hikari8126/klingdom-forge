import { db } from "@/lib/db";
import { getHealth } from "@/lib/health";
import { isWorkerOnline } from "@/lib/worker-status";
import { countEnabledAccounts } from "@/lib/kling-accounts";
import type { CurrentUser } from "@/lib/session";
import type { JobStatus, JobType, Prisma } from "@prisma/client";

const RUNNING: JobStatus[] = ["queued", "submitted", "processing"];

const TYPE_LABEL: Record<JobType, string> = {
  image2video: "Image → Video",
  lipsync: "Lipsync",
  motioncontrol: "Motion Control",
  avatar: "Avatar",
};

const STATUS_META: Record<JobStatus, { label: string; tone: "ok" | "accent" | "bad" | "muted" }> = {
  draft: { label: "Nháp", tone: "muted" },
  queued: { label: "Đang chờ", tone: "muted" },
  submitted: { label: "Đã gửi", tone: "accent" },
  processing: { label: "Đang chạy", tone: "accent" },
  succeeded: { label: "Hoàn tất", tone: "ok" },
  failed: { label: "Thất bại", tone: "bad" },
};

export type DashboardActivity = {
  id: string;
  title: string;
  meta: string;
  statusLabel: string;
  tone: "ok" | "accent" | "bad" | "muted";
};

export type DashboardData = {
  stats: {
    workspaces: number;
    projects: number;
    videos30d: number;
    running: number;
  };
  system: {
    db: boolean;
    worker: boolean;
    klingAccounts: number;
  };
  activity: DashboardActivity[];
};

/** Workspace IDs the actor can see: undefined means "all" (super_admin). */
async function accessibleWorkspaceIds(actor: CurrentUser): Promise<string[] | undefined> {
  if (actor.role === "super_admin") return undefined;
  const rows = await db.workspaceMember.findMany({
    where: { userId: actor.id },
    select: { workspaceId: true },
  });
  return rows.map((r) => r.workspaceId);
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.round(h / 24);
  return `${days} ngày trước`;
}

/** Everything the dashboard needs, scoped to the actor, in one round of parallel queries. */
export async function getDashboardData(actor: CurrentUser): Promise<DashboardData> {
  const wsIds = await accessibleWorkspaceIds(actor);
  // For non-admins with no memberships, short-circuit the scoped counts to zero.
  const scopeProject: Prisma.ProjectWhereInput | undefined =
    wsIds === undefined ? undefined : { workspaceId: { in: wsIds } };
  const scopeJob: Prisma.JobWhereInput =
    wsIds === undefined ? {} : { project: { workspaceId: { in: wsIds } } };
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    health,
    worker,
    klingAccounts,
    workspaces,
    projects,
    running,
    videos30d,
    recentJobs,
  ] = await Promise.all([
    getHealth(db),
    isWorkerOnline(),
    countEnabledAccounts(),
    wsIds === undefined
      ? db.workspace.count()
      : Promise.resolve(wsIds.length),
    db.project.count({ where: scopeProject }),
    db.job.count({ where: { ...scopeJob, status: { in: RUNNING } } }),
    db.job.count({
      where: { ...scopeJob, status: "succeeded", updatedAt: { gte: since30 } },
    }),
    db.job.findMany({
      where: scopeJob,
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        status: true,
        updatedAt: true,
        project: { select: { name: true } },
      },
    }),
  ]);

  const activity: DashboardActivity[] = recentJobs.map((j) => {
    const meta = STATUS_META[j.status];
    return {
      id: j.id,
      title: `${TYPE_LABEL[j.type]} · ${j.project.name}`,
      meta: relativeTime(j.updatedAt),
      statusLabel: meta.label,
      tone: meta.tone,
    };
  });

  return {
    stats: {
      workspaces,
      projects,
      videos30d,
      running,
    },
    system: {
      db: health.db,
      worker,
      klingAccounts,
    },
    activity,
  };
}
