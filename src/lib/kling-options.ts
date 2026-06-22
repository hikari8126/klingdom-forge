export type KlingImageMode = "std" | "pro" | "4k";
export type KlingVideoRatio = "9:16" | "16:9" | "1:1";
export type KlingMotionMode = "std" | "pro";
export type KlingMotionModel = "kling-v2-6" | "kling-v3";
export type KlingMotionOrientation = "image" | "video";
export type KlingSoundMode = "yes" | "no";
export type KlingAvatarMode = "std" | "pro";

export const DEFAULT_KLING_IMAGE_MODEL = "kling-v2-6";
export const DEFAULT_KLING_IMAGE_MODE: KlingImageMode = "std";
export const DEFAULT_KLING_IMAGE_DURATION = "5";
export const DEFAULT_KLING_VIDEO_RATIO: KlingVideoRatio = "9:16";
export const DEFAULT_KLING_MOTION_MODEL: KlingMotionModel = "kling-v2-6";
export const DEFAULT_KLING_MOTION_MODE: KlingMotionMode = "std";
export const DEFAULT_KLING_MOTION_ORIENTATION: KlingMotionOrientation = "image";
export const DEFAULT_KLING_SOUND_MODE: KlingSoundMode = "yes";
export const DEFAULT_KLING_AVATAR_MODE: KlingAvatarMode = "std";

export const KLING_I2V_MODELS: { value: string; label: string }[] = [
  { value: "kling-v3", label: "Kling 3.0" },
  { value: "kling-v2-6", label: "Kling 2.6" },
  { value: "kling-v2-5-turbo", label: "Kling 2.5 Turbo" },
  { value: "kling-v2-1", label: "Kling 2.1" },
  { value: "kling-v1-6", label: "Kling 1.6" },
];

export const KLING_IMAGE_MODE_OPTIONS: { value: KlingImageMode; label: string }[] = [
  { value: "std", label: "Standard" },
  { value: "pro", label: "Professional" },
  { value: "4k", label: "4K" },
];

export const KLING_VIDEO_RATIO_OPTIONS: { value: KlingVideoRatio; label: string }[] = [
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
  { value: "1:1", label: "1:1" },
];

export const KLING_MOTION_MODELS: { value: KlingMotionModel; label: string; note: string }[] = [
  { value: "kling-v2-6", label: "Kling 2.6", note: "Motion Control 2.6" },
  { value: "kling-v3", label: "Kling 3.0", note: "Motion Control 3.0" },
];

export const KLING_MOTION_MODE_OPTIONS: { value: KlingMotionMode; label: string; note: string }[] = [
  { value: "std", label: "Standard", note: "720p" },
  { value: "pro", label: "Professional", note: "1080p" },
];

export const KLING_MOTION_ORIENTATION_OPTIONS: { value: KlingMotionOrientation; label: string; note: string }[] = [
  { value: "image", label: "Image", note: "ref video <=10s" },
  { value: "video", label: "Video", note: "ref video <=30s" },
];

export const KLING_SOUND_MODE_OPTIONS: { value: KlingSoundMode; label: string }[] = [
  { value: "yes", label: "Keep Sound" },
  { value: "no", label: "Silent" },
];

export const KLING_AVATAR_MODE_OPTIONS: { value: KlingAvatarMode; label: string; note: string }[] = [
  { value: "std", label: "Standard", note: "cost-effective" },
  { value: "pro", label: "Professional", note: "higher quality" },
];

type KlingImageCapabilities = {
  durations: string[];
  modes: KlingImageMode[];
  nativeAudioModes: KlingImageMode[];
  supportsMultiShot: boolean;
  supportsVideoRatio: boolean;
  defaultMode: KlingImageMode;
  defaultDuration: string;
};

const FLEX_3_TO_15 = Array.from({ length: 13 }, (_, i) => String(i + 3));
const FIVE_OR_TEN = ["5", "10"];

const KLING_IMAGE_CAPABILITIES: Record<string, KlingImageCapabilities> = {
  "kling-v3": {
    durations: FLEX_3_TO_15,
    modes: ["std", "pro", "4k"],
    nativeAudioModes: ["std", "pro", "4k"],
    supportsMultiShot: true,
    supportsVideoRatio: true,
    defaultMode: "std",
    defaultDuration: "5",
  },
  "kling-v2-6": {
    durations: FIVE_OR_TEN,
    modes: ["std", "pro"],
    nativeAudioModes: ["pro"],
    supportsMultiShot: false,
    supportsVideoRatio: true,
    defaultMode: "std",
    defaultDuration: "5",
  },
  "kling-v2-5-turbo": {
    durations: FIVE_OR_TEN,
    modes: ["std", "pro"],
    nativeAudioModes: [],
    supportsMultiShot: false,
    supportsVideoRatio: true,
    defaultMode: "std",
    defaultDuration: "5",
  },
  "kling-v2-1": {
    durations: FIVE_OR_TEN,
    modes: ["std", "pro"],
    nativeAudioModes: [],
    supportsMultiShot: false,
    supportsVideoRatio: true,
    defaultMode: "std",
    defaultDuration: "5",
  },
  "kling-v1-6": {
    durations: FIVE_OR_TEN,
    modes: ["std", "pro"],
    nativeAudioModes: [],
    supportsMultiShot: false,
    supportsVideoRatio: true,
    defaultMode: "std",
    defaultDuration: "5",
  },
};

function isKnownMode(value: unknown): value is KlingImageMode {
  return value === "std" || value === "pro" || value === "4k";
}

function isKnownMotionMode(value: unknown): value is KlingMotionMode {
  return value === "std" || value === "pro";
}

function isKnownMotionModel(value: unknown): value is KlingMotionModel {
  return value === "kling-v2-6" || value === "kling-v3";
}

function isKnownMotionOrientation(value: unknown): value is KlingMotionOrientation {
  return value === "image" || value === "video";
}

function isKnownSoundMode(value: unknown): value is KlingSoundMode {
  return value === "yes" || value === "no";
}

export function isKnownVideoRatio(value: unknown): value is KlingVideoRatio {
  return value === "9:16" || value === "16:9" || value === "1:1";
}

export function getKlingImageCapabilities(modelName?: string): KlingImageCapabilities {
  return KLING_IMAGE_CAPABILITIES[modelName ?? ""] ?? KLING_IMAGE_CAPABILITIES[DEFAULT_KLING_IMAGE_MODEL];
}

export function sanitizeKlingImageSettings(input: {
  modelName?: unknown;
  mode?: unknown;
  duration?: unknown;
  videoRatio?: unknown;
  nativeAudio?: unknown;
  multiShot?: unknown;
}) {
  const modelName =
    typeof input.modelName === "string" && KLING_IMAGE_CAPABILITIES[input.modelName]
      ? input.modelName
      : DEFAULT_KLING_IMAGE_MODEL;
  const caps = getKlingImageCapabilities(modelName);
  const mode = isKnownMode(input.mode) && caps.modes.includes(input.mode) ? input.mode : caps.defaultMode;
  const duration =
    typeof input.duration === "string" && caps.durations.includes(input.duration)
      ? input.duration
      : caps.defaultDuration;
  const videoRatio = isKnownVideoRatio(input.videoRatio) ? input.videoRatio : DEFAULT_KLING_VIDEO_RATIO;
  const nativeAudio = Boolean(input.nativeAudio) && caps.nativeAudioModes.includes(mode);
  const multiShot = Boolean(input.multiShot) && caps.supportsMultiShot;

  return { modelName, mode, duration, videoRatio, nativeAudio, multiShot };
}

export function canUseKlingNativeAudio(modelName: string, mode: string) {
  const caps = getKlingImageCapabilities(modelName);
  return isKnownMode(mode) && caps.nativeAudioModes.includes(mode);
}

export function sanitizeKlingMotionSettings(input: {
  modelName?: unknown;
  mode?: unknown;
  characterOrientation?: unknown;
  keepOriginalSound?: unknown;
}) {
  const modelName = isKnownMotionModel(input.modelName) ? input.modelName : DEFAULT_KLING_MOTION_MODEL;
  const mode = isKnownMotionMode(input.mode) ? input.mode : DEFAULT_KLING_MOTION_MODE;
  const characterOrientation = isKnownMotionOrientation(input.characterOrientation)
    ? input.characterOrientation
    : DEFAULT_KLING_MOTION_ORIENTATION;
  const keepOriginalSound = isKnownSoundMode(input.keepOriginalSound)
    ? input.keepOriginalSound
    : DEFAULT_KLING_SOUND_MODE;

  return { modelName, mode, characterOrientation, keepOriginalSound };
}

export function sanitizeKlingAvatarSettings(input: { mode?: unknown }) {
  const mode = isKnownMotionMode(input.mode) ? input.mode : DEFAULT_KLING_AVATAR_MODE;
  return { mode };
}
