import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/** Root folder for uploaded images. */
export function uploadRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

const IMAGE_EXTS = /^\.(png|jpg|jpeg|webp|gif)$/;
const VIDEO_EXTS = /^\.(mp4|mov)$/;

/** Allow only known image or video extensions. Falls back to .png for unknowns. */
export function safeExt(filename: string): string {
  const e = path.extname(filename).toLowerCase();
  if (IMAGE_EXTS.test(e) || VIDEO_EXTS.test(e)) return e;
  return ".png";
}

export function isVideoExt(filename: string): boolean {
  return VIDEO_EXTS.test(path.extname(filename).toLowerCase());
}

export function mimeForFilename(filename: string): string {
  const e = path.extname(filename).toLowerCase();
  const MAP: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return MAP[e] ?? "application/octet-stream";
}

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
export function assertVideoSize(bytes: Buffer, filename: string): void {
  if (bytes.byteLength > MAX_VIDEO_BYTES) {
    throw new Error(`Video "${filename}" vượt quá 100 MB (giới hạn Kling Motion Control).`);
  }
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
