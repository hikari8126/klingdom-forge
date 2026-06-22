import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { requireUser } from "@/lib/session";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { listAssets } from "@/lib/assets";
import { countEnabledAccounts } from "@/lib/kling-accounts";
import { isWorkerOnline } from "@/lib/worker-status";
import { listCells, type CellParams } from "@/lib/cells";
import { listBatches } from "@/lib/batches";
import { listLibraryVideos } from "@/lib/library-videos";
import { normalizeOutputSlots, normalizeSlotErrors, normalizeSlotStatuses } from "@/lib/output-slots";
import { listUsersForRoleSettings, listWorkspaceApiSettings } from "@/lib/app-settings";
import { sanitizeKlingAvatarSettings, sanitizeKlingImageSettings, sanitizeKlingMotionSettings } from "@/lib/kling-options";
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
  const session = await auth();
  const googleDriveAccessToken =
    (session as unknown as { googleAccessToken?: string } | null)?.googleAccessToken ?? null;
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
        const motionSettings = j.type === "motioncontrol" ? sanitizeKlingMotionSettings(pr) : null;
        const avatarSettings = j.type === "avatar" ? sanitizeKlingAvatarSettings(pr) : null;
        const imageSettings =
          j.type === "image2video"
            ? sanitizeKlingImageSettings(pr)
            : {
                modelName: motionSettings?.modelName ?? pr.modelName ?? "kling-v2-6",
                mode: avatarSettings?.mode ?? motionSettings?.mode ?? pr.mode ?? "std",
                duration: pr.duration ?? "5",
                videoRatio: pr.videoRatio ?? "9:16",
                nativeAudio: pr.nativeAudio ?? false,
                multiShot: pr.multiShot ?? false,
              };
        return {
          id: j.id,
          status: j.status,
          type: j.type,
          resultUrl: j.resultUrl,
          resultUrls: (() => {
            const raw = Array.isArray(pr.resultUrls) ? (pr.resultUrls as (string | null)[]) : null;
            return normalizeOutputSlots(raw ?? undefined, j.resultUrl);
          })(),
          slotStatuses: normalizeSlotStatuses(
            Array.isArray(pr.slotStatuses) ? pr.slotStatuses : undefined,
            normalizeOutputSlots(Array.isArray(pr.resultUrls) ? (pr.resultUrls as (string | null)[]) : undefined, j.resultUrl),
          ),
          slotErrors: normalizeSlotErrors(Array.isArray(pr.slotErrors) ? pr.slotErrors : undefined),
          targetSlot: typeof pr.targetSlot === "number" ? pr.targetSlot : null,
          error: j.error,
          startAssetId: pr.startAssetId ?? "",
          endAssetId: pr.endAssetId ?? null,
          videoAssetId: pr.videoAssetId ?? null,
          libraryVideoId: pr.libraryVideoId ?? null,
          prompt: pr.prompt ?? "",
          modelName: imageSettings.modelName,
          mode: imageSettings.mode,
          duration: imageSettings.duration,
          videoRatio: imageSettings.videoRatio,
          nativeAudio: imageSettings.nativeAudio,
          multiShot: imageSettings.multiShot,
          characterOrientation: motionSettings?.characterOrientation ?? pr.characterOrientation ?? "image",
          keepOriginalSound: motionSettings?.keepOriginalSound ?? pr.keepOriginalSound ?? "yes",
          avatarAudioAssetId: pr.avatarAudioAssetId ?? null,
          avatarAudioId: pr.avatarAudioId ?? "",
          avatarSoundUrl: pr.avatarSoundUrl ?? "",
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

  const workspaceHasKlingKey = Boolean(result.workspace.klingApiKeyEnc);
  const hasAccount = workspaceHasKlingKey || (await countEnabledAccounts()) > 0;
  const workerOnline = await isWorkerOnline();
  const libraryVideos = (await listLibraryVideos()).map((v) => ({
    id: v.id,
    name: v.name,
    filename: v.filename,
    createdAt: v.createdAt.toISOString(),
  }));
  const appSettings =
    user.role === "super_admin"
      ? {
          users: (await listUsersForRoleSettings(user)).map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            createdAt: u.createdAt.toISOString(),
          })),
          workspaces: (await listWorkspaceApiSettings(user)).map((w) => ({
            id: w.id,
            name: w.name,
            hasKlingKey: w.hasKlingKey,
            createdAt: w.createdAt.toISOString(),
          })),
        }
      : null;

  return (
    <Studio
      workspaceId={params.workspaceId}
      workspaceName={result.workspace.name}
      userName={userName}
      userFullName={user.name ?? user.email}
      userRole={user.role}
      hasAccount={hasAccount}
      workspaceHasKlingKey={workspaceHasKlingKey}
      workerOnline={workerOnline}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      activeProjectId={activeProject?.id ?? null}
      activeBatchId={activeBatchId}
      activeBatches={batches}
      assets={assets}
      cells={cells}
      libraryVideos={libraryVideos}
      appSettings={appSettings}
      googleDriveAccessToken={googleDriveAccessToken}
      googleDrivePickerApiKey={process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? null}
      googleDriveAppId={process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? null}
    />
  );
}
