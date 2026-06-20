import { describe, it, expect } from "vitest";
import {
  buildImage2VideoBody,
  buildLipSyncBody,
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
