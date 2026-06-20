import Link from "next/link";
import { notFound } from "next/navigation";
import type { JobStatus } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { listJobsForProject } from "@/lib/queue";
import { Card, PageHeader, Button } from "@/components/ui";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<JobStatus, string> = {
  queued: "text-muted",
  submitted: "text-accent-soft",
  processing: "text-accent-soft",
  succeeded: "text-ok",
  failed: "text-bad",
};

export default async function ProjectPage({
  params,
}: {
  params: { workspaceId: string; projectId: string };
}) {
  const user = await requireUser();
  const result = await getProjectForUser(user, params.projectId);
  if (!result) notFound();
  const jobs = await listJobsForProject(params.projectId);
  const active = jobs.some(
    (j) => j.status === "queued" || j.status === "submitted" || j.status === "processing",
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <AutoRefresh active={active} />
      <div className="flex items-start justify-between">
        <PageHeader title={result.project.name} subtitle="Project" />
        <Link
          href={`/workspaces/${params.workspaceId}/projects/${params.projectId}/new-batch`}
        >
          <Button>+ Tạo batch</Button>
        </Link>
      </div>

      <div className="mt-8 space-y-2">
        {jobs.length === 0 && (
          <Card>
            <p className="text-muted">Chưa có job nào. Bấm &ldquo;Tạo batch&rdquo; để bắt đầu.</p>
          </Card>
        )}
        {jobs.map((j) => (
          <Card key={j.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-muted">
                {j.type} · {j.id.slice(0, 8)}
              </span>
              <span className={`text-sm ${STATUS_STYLE[j.status]}`}>{j.status}</span>
            </div>
            {j.status === "succeeded" && j.resultUrl && (
              <a
                href={j.resultUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-accent-soft underline"
              >
                Xem / tải video →
              </a>
            )}
            {j.status === "failed" && j.error && (
              <p className="mt-2 text-sm text-bad">{j.error}</p>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
