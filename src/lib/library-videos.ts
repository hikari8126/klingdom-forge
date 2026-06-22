import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { db } from "@/lib/db";
import { safeExt, mimeForFilename } from "@/lib/uploads";
import type { CurrentUser } from "@/lib/session";

export function libraryRoot(): string {
  return process.env.LIBRARY_DIR ?? path.join(process.cwd(), "library");
}

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
    data: { name: name.trim() || filename, filename, storedPath: "", mimeType: mime },
  });
  const root = libraryRoot();
  await mkdir(root, { recursive: true });
  const stored = path.join(root, record.id + safeExt(filename));
  await writeFile(stored, bytes);
  return db.libraryVideo.update({ where: { id: record.id }, data: { storedPath: stored } });
}

export async function deleteLibraryVideo(actor: CurrentUser, id: string) {
  if (actor.role !== "super_admin") throw new Error("Forbidden");
  const record = await db.libraryVideo.findUnique({ where: { id }, select: { storedPath: true } });
  await db.libraryVideo.delete({ where: { id } });
  if (record?.storedPath) await unlink(record.storedPath).catch(() => {});
}
