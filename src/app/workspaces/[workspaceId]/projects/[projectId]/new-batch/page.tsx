import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { canCreateProject } from "@/lib/access";
import { PageHeader } from "@/components/ui";
import BatchComposer from "./BatchComposer";

export const dynamic = "force-dynamic";

export default async function NewBatchPage({
  params,
}: {
  params: { workspaceId: string; projectId: string };
}) {
  const user = await requireUser();
  const result = await getProjectForUser(user, params.projectId);
  if (!result) notFound();
  if (!canCreateProject(user.role, result.membership)) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader title="Batch mới · Image → Video" subtitle={result.project.name} />
      <BatchComposer workspaceId={params.workspaceId} projectId={params.projectId} />
    </main>
  );
}
