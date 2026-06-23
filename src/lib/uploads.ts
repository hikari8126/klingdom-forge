import path from "node:path";
import { getStorage } from "@/lib/storage";

const IMAGE_EXTS = /^\.(png|jpg|jpeg|webp|gif)$/;
const VIDEO_EXTS = /^\.(mp4|mov)$/;
const AUDIO_EXTS = /^\.(mp3|wav|m4a|aac)$/;

/** Allow only known media extensions. Falls back to .png for unknowns. */
export function safeExt(filename: string): string {
  const e = path.extname(filename).toLowerCase();
  if (IMAGE_EXTS.test(e) || VIDEO_EXTS.test(e) || AUDIO_EXTS.test(e)) return e;
  return ".png";
}

export function isVideoExt(filename: string): boolean {
  return VIDEO_EXTS.test(path.extname(filename).toLowerCase());
}

export function isAudioExt(filename: string): boolean {
  return AUDIO_EXTS.test(path.extname(filename).toLowerCase());
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
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
  };
  return MAP[e] ?? "application/octet-stream";
}

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB
export function assertVideoSize(bytes: Buffer, filename: string): void {
  if (bytes.byteLength > MAX_VIDEO_BYTES) {
    throw new Error(`Video "${filename}" vượt quá 100 MB (giới hạn Kling Motion Control).`);
  }
}

export function assertAudioSize(bytes: Buffer, filename: string): void {
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`Audio "${filename}" vượt quá 5 MB (giới hạn Kling Avatar).`);
  }
}

/** Object-storage keys. assetId/libraryVideoId are app-generated (cuid), so keys
 *  cannot escape their prefix regardless of the original filename. */
export function assetKey(projectId: string, assetId: string, filename: string): string {
  return `assets/${projectId}/${assetId}${safeExt(filename)}`;
}

export function thumbKey(projectId: string, assetId: string): string {
  return `thumbs/${projectId}/${assetId}.webp`;
}

export function libraryKey(libraryVideoId: string, filename: string): string {
  return `library/${libraryVideoId}${safeExt(filename)}`;
}

/** Upload bytes to object storage and return the stored key. */
export async function saveUpload(projectId: string, assetId: string, filename: string, bytes: Buffer): Promise<string> {
  const key = assetKey(projectId, assetId, filename);
  await getStorage().put(key, bytes, mimeForFilename(filename));
  return key;
}

/** Read a stored object and return raw base64 (no data: prefix) for Kling. */
export async function fileToBase64(key: string): Promise<string> {
  return (await getStorage().read(key)).toString("base64");
}

/** Best-effort bulk delete of stored objects. Missing/empty keys are not an error. */
export async function deleteUpload(...keys: string[]): Promise<void> {
  const real = keys.filter(Boolean);
  if (real.length === 0) return;
  await getStorage().delete(real);
}
