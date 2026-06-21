import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { ForbiddenError } from "@/lib/workspaces";
import { saveUpload, mimeForFilename } from "@/lib/uploads";

/** Save an uploaded file (image or video) to disk + DB, scoped to a project the actor can access. */
export async function createAsset(
  actor: CurrentUser,
  projectId: string,
  filename: string,
  bytes: Buffer,
) {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  const mime = mimeForFilename(filename);
  const id = (await db.asset.create({ data: { projectId, filename, storedPath: "", mimeType: mime } })).id;
  const storedPath = await saveUpload(projectId, id, filename, bytes);
  return db.asset.update({
    where: { id },
    data: { storedPath },
    select: { id: true, filename: true, storedPath: true, mimeType: true },
  });
}

/** List a project's assets (newest first) if the actor can access it. */
export async function listAssets(actor: CurrentUser, projectId: string) {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  return db.asset.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, storedPath: true, mimeType: true, createdAt: true },
  });
}

/** Internal: resolve an asset's stored path (worker/cell use). */
export async function assetPath(assetId: string): Promise<string | null> {
  const a = await db.asset.findUnique({ where: { id: assetId }, select: { storedPath: true } });
  return a?.storedPath ?? null;
}
