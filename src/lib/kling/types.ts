export type KlingTaskStatus = "submitted" | "processing" | "succeed" | "failed";

export type Image2VideoParams = {
  image: string; // base64 (no data: prefix) OR a public URL
  imageTail?: string;
  prompt?: string;
  negativePrompt?: string;
  modelName?: string; // e.g. "kling-v1"
  mode?: "std" | "pro" | "4k";
  duration?: string; // "3".."15" per Kling docs; "5" default
  cfgScale?: number;
  callbackUrl?: string;
};

export type MotionControlParams = {
  /** Reference image: base64 (no prefix) OR public URL. */
  imageUrl: string;
  /** Motion reference video: base64 (no prefix) OR public URL. Up to 100 MB, 3–30 s. */
  videoUrl: string;
  /** "image" = video ≤10 s; "video" = video ≤30 s. */
  characterOrientation: "image" | "video";
  mode: "std" | "pro";
  modelName?: string; // kling-v2-6 (default) | kling-v3
  prompt?: string;
  keepOriginalSound?: "yes" | "no";
  callbackUrl?: string;
};

export type AvatarParams = {
  avatarId: string;
  avatarType?: "2d" | "3d";
  voiceId: string;
  voiceLanguage: string;
  voiceSpeed?: number; // 0.8–2.0, default 1.0
  text: string;
  callbackUrl?: string;
};

export type LipSyncParams = {
  mode: "text2video" | "audio2video";
  videoId?: string;
  videoUrl?: string;
  text?: string;
  voiceId?: string;
  voiceLanguage?: string;
  audioType?: "file" | "url";
  audioFile?: string;
  audioUrl?: string;
  callbackUrl?: string;
};

/** A task as our app sees it, normalized from the Kling response envelope. */
export type KlingTask = {
  taskId: string;
  status: KlingTaskStatus;
  videoUrl?: string;
  statusMessage?: string;
};

/** Raised for any Kling API failure (non-zero code or HTTP error). */
export class KlingError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "KlingError";
    this.code = code;
  }
}
