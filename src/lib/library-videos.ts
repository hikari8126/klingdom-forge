import { db } from "@/lib/db";
import { mimeForFilename, libraryKey } from "@/lib/uploads";
import { getStorage } from "@/lib/storage";
import type { CurrentUser } from "@/lib/session";

export async function listLibraryVideos() {
  return db.libraryVideo.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createLibraryVideo(
  actor: CurrentUser,
  name: string,
  filename: string,
  bytes: Buffer,
) {
  if (actor.role !== "super_admin") throw new Error("Forbidden");
  const mime = mimeForFilename(filename);
  const record = await db.libraryVideo.create({
    data: { name: name.trim() || filename, filename, storageKey: "", mimeType: mime },
  });
  const storageKey = libraryKey(record.id, filename);
  await getStorage().put(storageKey, bytes, mime);
  return db.libraryVideo.update({ where: { id: record.id }, data: { storageKey } });
}

export async function deleteLibraryVideos(actor: CurrentUser, ids: string[]) {
  if (actor.role !== "super_admin") throw new Error("Forbidden");
  const cleanIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (cleanIds.length === 0) return 0;

  const records = await db.libraryVideo.findMany({
    where: { id: { in: cleanIds } },
    select: { id: true, storageKey: true },
  });
  if (records.length === 0) return 0;

  await db.libraryVideo.deleteMany({ where: { id: { in: records.map((r) => r.id) } } });
  await getStorage().delete(records.map((r) => r.storageKey).filter(Boolean));
  return records.length;
}

export async function deleteLibraryVideo(actor: CurrentUser, id: string) {
  return deleteLibraryVideos(actor, [id]);
}
