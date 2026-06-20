import { describe, it, expect } from "vitest";
import { KlingClient, type KlingFetch } from "@/lib/kling/client";
import { KlingError } from "@/lib/kling/types";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeFetch(
  response: { ok: boolean; status: number; json: unknown },
  calls: Call[],
): KlingFetch {
  return async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json,
    };
  };
}

function client(fetchFn: KlingFetch) {
  return new KlingClient({
    accessKey: "ak",
    secretKey: "sk",
    baseUrl: "https://api.example.com",
    fetchFn,
    nowSeconds: () => 1_700_000_000,
  });
}

describe("KlingClient.createImage2Video", () => {
  it("POSTs to the image2video endpoint with a Bearer token and the built body", async () => {
    const calls: Call[] = [];
    const c = client(
      fakeFetch({ ok: true, status: 200, json: { code: 0, data: { task_id: "t1", task_status: "submitted" } } }, calls),
    );
    const task = await c.createImage2Video({ image: "IMG", prompt: "hi" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.com/v1/videos/image2video");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toMatch(/^Bearer .+\..+\..+$/);
    expect(JSON.parse(calls[0].body!)).toEqual({ image: "IMG", prompt: "hi" });
    expect(task).toEqual({ taskId: "t1", status: "submitted", videoUrl: undefined, statusMessage: undefined });
  });
});

describe("KlingClient.createLipSync", () => {
  it("POSTs to the lip-sync endpoint with the nested input body", async () => {
    const calls: Call[] = [];
    const c = client(
      fakeFetch({ ok: true, status: 200, json: { code: 0, data: { task_id: "l1", task_status: "submitted" } } }, calls),
    );
    await c.createLipSync({ mode: "text2video", videoId: "v", text: "hello" });
    expect(calls[0].url).toBe("https://api.example.com/v1/videos/lip-sync");
    expect(JSON.parse(calls[0].body!)).toEqual({ input: { mode: "text2video", video_id: "v", text: "hello" } });
  });
});

describe("KlingClient.getTask", () => {
  it("GETs the task by kind + id and parses the result url", async () => {
    const calls: Call[] = [];
    const c = client(
      fakeFetch(
        { ok: true, status: 200, json: { code: 0, data: { task_id: "t1", task_status: "succeed", task_result: { videos: [{ url: "https://cdn/c.mp4" }] } } } },
        calls,
      ),
    );
    const task = await c.getTask("image2video", "t1");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.example.com/v1/videos/image2video/t1");
    expect(task.videoUrl).toBe("https://cdn/c.mp4");
  });
});

describe("KlingClient error handling", () => {
  it("throws KlingError on an HTTP error status", async () => {
    const c = client(fakeFetch({ ok: false, status: 401, json: { message: "unauthorized" } }, []));
    await expect(c.getTask("image2video", "x")).rejects.toBeInstanceOf(KlingError);
  });

  it("throws KlingError when the envelope code is non-zero", async () => {
    const c = client(fakeFetch({ ok: true, status: 200, json: { code: 1101, message: "bad" } }, []));
    await expect(c.createImage2Video({ image: "IMG" })).rejects.toThrow("bad");
  });
});
