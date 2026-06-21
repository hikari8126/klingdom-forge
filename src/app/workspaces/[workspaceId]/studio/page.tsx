import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { listAssets } from "@/lib/assets";
import { listCells, type CellParams } from "@/lib/cells";
import Studio, { type CellView } from "./Studio";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: { workspaceId: string };
  searchParams: { p?: string };
}) {
  const user = await requireUser();
  const result = await getWorkspaceForUser(user, params.workspaceId);
  if (!result) notFound();
  const projects = result.workspace.projects;
  const activeProject = projects.find((p) => p.id === searchParams.p) ?? projects[0] ?? null;

  let assets: { id: string; filename: string; mimeType: string | null }[] = [];
  let cells: CellView[] = [];
  if (activeProject) {
    assets = (await listAssets(user, activeProject.id)).map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType ?? null }));
    cells = (await listCells(user, activeProject.id)).map((j) => {
      const pr = j.params as CellParams;
      return {
        id: j.id,
        status: j.status,
        type: j.type,
        resultUrl: j.resultUrl,
        error: j.error,
        startAssetId: pr.startAssetId,
        endAssetId: pr.endAssetId ?? null,
        videoAssetId: pr.videoAssetId ?? null,
        prompt: pr.prompt ?? "",
        modelName: pr.modelName,
        mode: pr.mode,
        duration: pr.duration,
        characterOrientation: pr.characterOrientation ?? "image",
        keepOriginalSound: pr.keepOriginalSound ?? "yes",
      };
    });
  }

  const rawName = user.name ?? user.email;
  const userName = (() => {
    const parts = rawName.trim().split(/[\s.@_-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return rawName.slice(0, 2).toUpperCase();
  })();

  return (
    <Studio
      workspaceId={params.workspaceId}
      workspaceName={result.workspace.name}
      userName={userName}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      activeProjectId={activeProject?.id ?? null}
      assets={assets}
      cells={cells}
    />
  );
}
