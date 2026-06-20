export type KlingTaskStatus = "submitted" | "processing" | "succeed" | "failed";

export type Image2VideoParams = {
  image: string; // base64 (no data: prefix) OR a public URL
  imageTail?: string;
  prompt?: string;
  negativePrompt?: string;
  modelName?: string; // e.g. "kling-v1"
  mode?: "std" | "pro";
  duration?: "5" | "10";
  cfgScale?: number;
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
