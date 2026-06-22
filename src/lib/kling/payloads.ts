import type { AvatarParams, Image2VideoParams, LipSyncParams, MotionControlParams, KlingTask } from "./types";
import { KlingError } from "./types";

/** Build the image2video request body, omitting undefined fields. */
export function buildImage2VideoBody(
  p: Image2VideoParams,
): Record<string, unknown> {
  const body: Record<string, unknown> = { image: p.image };
  if (p.imageTail !== undefined) body.image_tail = p.imageTail;
  if (p.prompt !== undefined) body.prompt = p.prompt;
  if (p.negativePrompt !== undefined) body.negative_prompt = p.negativePrompt;
  if (p.modelName !== undefined) body.model_name = p.modelName;
  if (p.mode !== undefined) body.mode = p.mode;
  if (p.duration !== undefined) body.duration = p.duration;
  if (p.aspectRatio !== undefined) body.aspect_ratio = p.aspectRatio;
  if (p.sound !== undefined) body.sound = p.sound;
  if (p.multiShot !== undefined) body.multi_shot = p.multiShot;
  if (p.shotType !== undefined) body.shot_type = p.shotType;
  if (p.cfgScale !== undefined) body.cfg_scale = p.cfgScale;
  if (p.callbackUrl !== undefined) body.callback_url = p.callbackUrl;
  return body;
}

/** Build the motion-control request body (POST /v1/videos/motion-control). */
export function buildMotionControlBody(p: MotionControlParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    image_url: p.imageUrl,
    video_url: p.videoUrl,
    character_orientation: p.characterOrientation,
    mode: p.mode,
  };
  if (p.modelName !== undefined) body.model_name = p.modelName;
  if (p.prompt !== undefined) body.prompt = p.prompt;
  if (p.keepOriginalSound !== undefined) body.keep_original_sound = p.keepOriginalSound;
  if (p.callbackUrl !== undefined) body.callback_url = p.callbackUrl;
  return body;
}

/** Build the lip-sync request body (fields nested under `input`). */
export function buildLipSyncBody(p: LipSyncParams): Record<string, unknown> {
  const input: Record<string, unknown> = { mode: p.mode };
  if (p.videoId !== undefined) input.video_id = p.videoId;
  if (p.videoUrl !== undefined) input.video_url = p.videoUrl;
  if (p.text !== undefined) input.text = p.text;
  if (p.voiceId !== undefined) input.voice_id = p.voiceId;
  if (p.voiceLanguage !== undefined) input.voice_language = p.voiceLanguage;
  if (p.audioType !== undefined) input.audio_type = p.audioType;
  if (p.audioFile !== undefined) input.audio_file = p.audioFile;
  if (p.audioUrl !== undefined) input.audio_url = p.audioUrl;
  const body: Record<string, unknown> = { input };
  if (p.callbackUrl !== undefined) body.callback_url = p.callbackUrl;
  return body;
}

/** Build the avatar request body (POST /v1/videos/avatar/image2video). */
export function buildAvatarBody(p: AvatarParams): Record<string, unknown> {
  const body: Record<string, unknown> = { image: p.image };
  if (p.audioId !== undefined) body.audio_id = p.audioId;
  if (p.soundFile !== undefined) body.sound_file = p.soundFile;
  if (p.prompt !== undefined) body.prompt = p.prompt;
  if (p.mode !== undefined) body.mode = p.mode;
  if (p.callbackUrl !== undefined) body.callback_url = p.callbackUrl;
  return body;
}

/**
 * Normalize a Kling task response (create or query) into a KlingTask.
 * Throws KlingError when the envelope reports a non-zero code.
 */
export function parseTaskResponse(json: unknown): KlingTask {
  if (!json || typeof json !== "object") {
    throw new KlingError("Empty Kling response");
  }
  const env = json as {
    code?: number;
    message?: string;
    data?: {
      task_id?: string;
      task_status?: KlingTask["status"];
      task_status_msg?: string;
      task_result?: { videos?: Array<{ url?: string }> };
    };
  };
  if (env.code !== 0) {
    throw new KlingError(env.message ?? "Kling API error", env.code);
  }
  const data = env.data ?? {};
  const firstUrl = data.task_result?.videos?.[0]?.url;
  return {
    taskId: String(data.task_id ?? ""),
    status: data.task_status as KlingTask["status"],
    videoUrl: firstUrl ? String(firstUrl) : undefined,
    statusMessage: data.task_status_msg,
  };
}
