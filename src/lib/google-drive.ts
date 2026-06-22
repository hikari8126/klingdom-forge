import path from "node:path";
import { auth } from "@/auth";
import type { CurrentUser } from "@/lib/session";
import { createAsset } from "@/lib/assets";
import { assertAudioSize, assertVideoSize } from "@/lib/uploads";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_IMPORT_FILES = Number(process.env.GOOGLE_DRIVE_MAX_IMPORT_FILES ?? 150);

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
};

export type DriveImportResult = {
  imported: number;
  skipped: number;
  totalFound: number;
  names: string[];
};

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function isFolder(file: DriveFileMeta): boolean {
  return file.mimeType === FOLDER_MIME;
}

function isSupportedMedia(file: DriveFileMeta): boolean {
  return file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/") || file.mimeType.startsWith("audio/");
}

function extForMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
  };
  return map[mimeType] ?? "";
}

function filenameWithExt(file: DriveFileMeta): string {
  if (path.extname(file.name)) return file.name;
  return `${file.name}${extForMime(file.mimeType)}`;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

/** Extracts a Google Drive file/folder ID from common sharing URLs, or accepts a raw ID. */
export function parseGoogleDriveId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const patterns = [
    /drive\.google\.com\/drive\/folders\/([^/?#]+)/,
    /drive\.google\.com\/file\/d\/([^/?#]+)/,
    /drive\.google\.com\/open\?id=([^&#]+)/,
    /[?&]id=([^&#]+)/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }

  // Drive IDs are URL-safe-ish opaque strings. Keep this deliberately strict so
  // pasted prose doesn't accidentally become an API request.
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
  return null;
}

export async function getGoogleDriveAccessToken(): Promise<string> {
  const session = await auth();
  const token = (session as unknown as { googleAccessToken?: string }).googleAccessToken;
  if (!token) {
    throw new Error(
      "Chưa có quyền đọc Google Drive. Hãy đăng xuất rồi đăng nhập lại Google để cấp quyền Drive read-only.",
    );
  }
  return token;
}

async function driveJson<T>(accessToken: string, url: URL): Promise<T> {
  const res = await fetch(url, { headers: bearer(accessToken) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive API lỗi ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function getDriveFile(accessToken: string, fileId: string): Promise<DriveFileMeta> {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,mimeType,size");
  url.searchParams.set("supportsAllDrives", "true");
  return driveJson<DriveFileMeta>(accessToken, url);
}

async function listDriveFolderChildren(accessToken: string, folderId: string): Promise<DriveFileMeta[]> {
  const out: DriveFileMeta[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("q", `'${escapeDriveQueryValue(folderId)}' in parents and trashed=false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const page = await driveJson<{ nextPageToken?: string; files?: DriveFileMeta[] }>(accessToken, url);
    out.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return out;
}

async function collectDriveMedia(
  accessToken: string,
  fileOrFolderId: string,
  seen = new Set<string>(),
): Promise<DriveFileMeta[]> {
  if (seen.has(fileOrFolderId)) return [];
  seen.add(fileOrFolderId);

  const root = await getDriveFile(accessToken, fileOrFolderId);
  if (isSupportedMedia(root)) return [root];
  if (!isFolder(root)) return [];

  const children = await listDriveFolderChildren(accessToken, root.id);
  const media: DriveFileMeta[] = [];
  for (const child of children) {
    if (media.length >= MAX_IMPORT_FILES) break;
    if (isSupportedMedia(child)) {
      media.push(child);
    } else if (isFolder(child)) {
      media.push(...(await collectDriveMedia(accessToken, child.id, seen)));
    }
  }
  return media.slice(0, MAX_IMPORT_FILES);
}

async function downloadDriveBlob(accessToken: string, file: DriveFileMeta): Promise<Buffer> {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, { headers: bearer(accessToken) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Không tải được "${file.name}" từ Drive (${res.status}): ${text || res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function importGoogleDriveAssets(
  actor: CurrentUser,
  projectId: string,
  batchId: string | undefined,
  accessToken: string,
  driveInput: string,
): Promise<DriveImportResult> {
  const id = parseGoogleDriveId(driveInput);
  if (!id) throw new Error("Link/ID Google Drive không hợp lệ");

  const files = await collectDriveMedia(accessToken, id);
  const result: DriveImportResult = { imported: 0, skipped: 0, totalFound: files.length, names: [] };

  for (const file of files) {
    try {
      if (file.mimeType.startsWith("video/") && file.size && Number(file.size) > 100 * 1024 * 1024) {
        result.skipped += 1;
        continue;
      }
      if (file.mimeType.startsWith("audio/") && file.size && Number(file.size) > 5 * 1024 * 1024) {
        result.skipped += 1;
        continue;
      }
      const bytes = await downloadDriveBlob(accessToken, file);
      if (file.mimeType.startsWith("video/")) assertVideoSize(bytes, file.name);
      if (file.mimeType.startsWith("audio/")) assertAudioSize(bytes, file.name);
      const asset = await createAsset(actor, projectId, filenameWithExt(file), bytes, batchId);
      result.imported += 1;
      result.names.push(asset.filename);
    } catch {
      result.skipped += 1;
    }
  }

  return result;
}
