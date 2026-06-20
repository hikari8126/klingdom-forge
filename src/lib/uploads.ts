import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/** Root folder for uploaded images. */
export function uploadRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

/** Allow only known image extensions; fall back to .png. (.jpeg preserved.) */
export function safeExt(filename: string): string {
  const e = path.extname(filename).toLowerCase();
  return /^\.(png|jpg|jpeg|webp|gif)$/.test(e) ? e : ".png";
}

/** Deterministic on-disk path for an asset. assetId is app-generated (cuid), so the
 *  path cannot escape `root` regardless of the original filename. */
export function assetStoredPath(root: string, projectId: string, assetId: string, filename: string): string {
  return path.join(root, projectId, assetId + safeExt(filename));
}

/** Write bytes to disk and return the stored absolute path. */
export async function saveUpload(projectId: string, assetId: string, filename: string, bytes: Buffer): Promise<string> {
  const root = uploadRoot();
  await mkdir(path.join(root, projectId), { recursive: true });
  const stored = assetStoredPath(root, projectId, assetId, filename);
  await writeFile(stored, bytes);
  return stored;
}

/** Read a stored file and return raw base64 (no data: prefix) for Kling. */
export async function fileToBase64(storedPath: string): Promise<string> {
  return (await readFile(storedPath)).toString("base64");
}
