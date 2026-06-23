import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { ForbiddenError } from "@/lib/workspaces";
import { saveUpload, deleteUpload, mimeForFilename, thumbKey } from "@/lib/uploads";

/** Save an uploaded file (image or video) to object storage + DB, scoped to a project/batch the actor can access. */
export async function createAsset(
  actor: CurrentUser,
  projectId: string,
  filename: string,
  bytes: Buffer,
  batchId?: string,
) {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  const mime = mimeForFilename(filename);
  const id = (await db.asset.create({ data: { projectId, batchId, filename, storageKey: "", mimeType: mime } })).id;
  const storageKey = await saveUpload(projectId, id, filename, bytes);
  return db.asset.update({
    where: { id },
    data: { storageKey },
    select: { id: true, filename: true, storageKey: true, mimeType: true },
  });
}

/** List assets for a project (or a specific batch within it) if the actor can access it. */
export async function listAssets(actor: CurrentUser, projectId: string, batchId?: string) {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  return db.asset.findMany({
    where: { projectId, ...(batchId !== undefined ? { batchId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, storageKey: true, mimeType: true, createdAt: true },
  });
}

/** Delete an asset (DB row + stored object + thumbnail) if the actor can access its project. */
export async function deleteAsset(actor: CurrentUser, assetId: string) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { id: true, projectId: true, storageKey: true },
  });
  if (!asset) return;
  const access = await getProjectForUser(actor, asset.projectId);
  if (!access) throw new ForbiddenError();
  await db.asset.delete({ where: { id: asset.id } });
  await deleteUpload(asset.storageKey, thumbKey(asset.projectId, asset.id));
}

/** Internal: resolve an asset's storage key (worker/cell use). */
export async function assetPath(assetId: string): Promise<string | null> {
  const a = await db.asset.findUnique({ where: { id: assetId }, select: { storageKey: true } });
  return a?.storageKey ?? null;
}
