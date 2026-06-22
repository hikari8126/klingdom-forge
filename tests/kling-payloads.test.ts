import { describe, it, expect } from "vitest";
import {
  buildAvatarBody,
  buildImage2VideoBody,
  buildLipSyncBody,
  buildMotionControlBody,
  parseTaskResponse,
} from "@/lib/kling/payloads";
import { KlingError } from "@/lib/kling/types";

describe("buildImage2VideoBody", () => {
  it("includes the required image and omits undefined fields", () => {
    expect(buildImage2VideoBody({ image: "BASE64DATA" })).toEqual({
      image: "BASE64DATA",
    });
  });

  it("maps camelCase params to the API's snake_case fields", () => {
    expect(
      buildImage2VideoBody({
        image: "IMG",
        prompt: "a cat",
        negativePrompt: "blurry",
        modelName: "kling-v1",
        mode: "pro",
        duration: "10",
        aspectRatio: "9:16",
        sound: "on",
        multiShot: true,
        shotType: "intelligence",
        cfgScale: 0.5,
        callbackUrl: "https://cb",
      }),
    ).toEqual({
      image: "IMG",
      prompt: "a cat",
      negative_prompt: "blurry",
      model_name: "kling-v1",
      mode: "pro",
      duration: "10",
      aspect_ratio: "9:16",
      sound: "on",
      multi_shot: true,
      shot_type: "intelligence",
      cfg_scale: 0.5,
      callback_url: "https://cb",
    });
  });
});

describe("buildLipSyncBody", () => {
  it("wraps fields under `input` and maps to snake_case", () => {
    expect(
      buildLipSyncBody({
        mode: "text2video",
        videoId: "vid123",
        text: "hello",
        voiceId: "v1",
        voiceLanguage: "en",
        callbackUrl: "https://cb",
      }),
    ).toEqual({
      input: {
        mode: "text2video",
        video_id: "vid123",
        text: "hello",
        voice_id: "v1",
        voice_language: "en",
      },
      callback_url: "https://cb",
    });
  });
});

describe("buildMotionControlBody", () => {
  it("includes required fields and maps to snake_case", () => {
    expect(
      buildMotionControlBody({
        imageUrl: "BASE64_IMG",
        videoUrl: "BASE64_VID",
        characterOrientation: "image",
        mode: "std",
      }),
    ).toEqual({
      image_url: "BASE64_IMG",
      video_url: "BASE64_VID",
      character_orientation: "image",
      mode: "std",
    });
  });

  it("includes optional fields when provided", () => {
    expect(
      buildMotionControlBody({
        imageUrl: "IMG",
        videoUrl: "VID",
        characterOrientation: "video",
        mode: "pro",
        modelName: "kling-v3",
        prompt: "walk forward",
        keepOriginalSound: "no",
        callbackUrl: "https://cb",
      }),
    ).toEqual({
      image_url: "IMG",
      video_url: "VID",
      character_orientation: "video",
      mode: "pro",
      model_name: "kling-v3",
      prompt: "walk forward",
      keep_original_sound: "no",
      callback_url: "https://cb",
    });
  });

  it("omits optional fields when undefined", () => {
    const body = buildMotionControlBody({
      imageUrl: "I",
      videoUrl: "V",
      characterOrientation: "image",
      mode: "std",
    });
    expect(body).not.toHaveProperty("model_name");
    expect(body).not.toHaveProperty("prompt");
    expect(body).not.toHaveProperty("keep_original_sound");
  });
});

describe("buildAvatarBody", () => {
  it("maps avatar image2video fields to snake_case", () => {
    expect(
      buildAvatarBody({
        image: "IMG",
        soundFile: "AUDIO_B64",
        prompt: "smile and wave",
        mode: "pro",
        callbackUrl: "https://cb",
      }),
    ).toEqual({
      image: "IMG",
      sound_file: "AUDIO_B64",
      prompt: "smile and wave",
      mode: "pro",
      callback_url: "https://cb",
    });
  });

  it("can send a Kling TTS audio_id instead of sound_file", () => {
    expect(buildAvatarBody({ image: "IMG", audioId: "aud_123" })).toEqual({
      image: "IMG",
      audio_id: "aud_123",
    });
  });
});

describe("parseTaskResponse", () => {
  it("extracts taskId + status from a create/query envelope", () => {
    expect(
      parseTaskResponse({
        code: 0,
        message: "SUCCEED",
        data: { task_id: "t1", task_status: "submitted" },
      }),
    ).toEqual({ taskId: "t1", status: "submitted", videoUrl: undefined, statusMessage: undefined });
  });

  it("extracts the first video url when the task has succeeded", () => {
    const task = parseTaskResponse({
      code: 0,
      data: {
        task_id: "t2",
        task_status: "succeed",
        task_result: { videos: [{ id: "v", url: "https://cdn/clip.mp4", duration: "5" }] },
      },
    });
    expect(task.status).toBe("succeed");
    expect(task.videoUrl).toBe("https://cdn/clip.mp4");
  });

  it("surfaces the status message on failure", () => {
    const task = parseTaskResponse({
      code: 0,
      data: { task_id: "t3", task_status: "failed", task_status_msg: "content blocked" },
    });
    expect(task.status).toBe("failed");
    expect(task.statusMessage).toBe("content blocked");
  });

  it("throws KlingError when the API returns a non-zero code", () => {
    expect(() => parseTaskResponse({ code: 1101, message: "bad request" })).toThrow(KlingError);
    try {
      parseTaskResponse({ code: 1101, message: "bad request" });
    } catch (e) {
      expect((e as KlingError).code).toBe(1101);
      expect((e as KlingError).message).toBe("bad request");
    }
  });
});
