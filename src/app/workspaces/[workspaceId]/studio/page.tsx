import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { listAssets } from "@/lib/assets";
import { countEnabledAccounts } from "@/lib/kling-accounts";
import { isWorkerOnline } from "@/lib/worker-status";
import { listCells, type CellParams } from "@/lib/cells";
import { listBatches } from "@/lib/batches";
import Studio, { type CellView } from "./Studio";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: { workspaceId: string };
  searchParams: { p?: string; b?: string };
}) {
  const user = await requireUser();
  const result = await getWorkspaceForUser(user, params.workspaceId);
  if (!result) notFound();
  const projects = result.workspace.projects;
  const activeProject = projects.find((p) => p.id === searchParams.p) ?? projects[0] ?? null;

  let assets: { id: string; filename: string; mimeType: string | null }[] = [];
  let cells: CellView[] = [];
  let batches: { id: string; name: string; jobCount: number; createdAt: string }[] = [];
  let activeBatchId: string | null = null;

  if (activeProject) {
    const rawBatches = await listBatches(user, activeProject.id);
    batches = rawBatches.map((b) => ({
      id: b.id,
      name: b.name,
      jobCount: b._count.jobs,
      createdAt: b.createdAt.toISOString(),
    }));

    // Auto-select batch from URL, or the most recent one
    const urlBatch = batches.find((b) => b.id === searchParams.b);
    const activeBatch = urlBatch ?? batches[0] ?? null;
    activeBatchId = activeBatch?.id ?? null;

    if (activeBatchId) {
      assets = (await listAssets(user, activeProject.id, activeBatchId)).map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType ?? null,
      }));
    }

    if (activeBatchId) {
      cells = (await listCells(user, activeProject.id, activeBatchId)).map((j) => {
        const pr = j.params as CellParams;
        return {
          id: j.id,
          status: j.status,
          type: j.type,
          resultUrl: j.resultUrl,
          error: j.error,
          startAssetId: pr.startAssetId ?? "",
          endAssetId: pr.endAssetId ?? null,
          videoAssetId: pr.videoAssetId ?? null,
          prompt: pr.prompt ?? "",
          modelName: pr.modelName,
          mode: pr.mode,
          duration: pr.duration,
          characterOrientation: pr.characterOrientation ?? "image",
          keepOriginalSound: pr.keepOriginalSound ?? "yes",
          avatarId: pr.avatarId ?? "",
          avatarType: (pr.avatarType ?? "2d") as "2d" | "3d",
          voiceId: pr.voiceId ?? "",
          voiceLanguage: pr.voiceLanguage ?? "en",
          voiceSpeed: pr.voiceSpeed ?? 1.0,
          avatarText: pr.avatarText ?? "",
        };
      });
    }
  }

  const rawName = user.name ?? user.email;
  const userName = (() => {
    const parts = rawName.trim().split(/[\s.@_-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return rawName.slice(0, 2).toUpperCase();
  })();

  const hasAccount = (await countEnabledAccounts()) > 0;
  const workerOnline = await isWorkerOnline();

  return (
    <Studio
      workspaceId={params.workspaceId}
      workspaceName={result.workspace.name}
      userName={userName}
      userFullName={user.name ?? user.email}
      hasAccount={hasAccount}
      workerOnline={workerOnline}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      activeProjectId={activeProject?.id ?? null}
      activeBatchId={activeBatchId}
      activeBatches={batches}
      assets={assets}
      cells={cells}
    />
  );
}
