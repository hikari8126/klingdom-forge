# KlingDom Forge — Milestone 3: Kling API Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-contained, well-tested Kling API client library (`src/lib/kling/`) that signs per-account JWTs, creates Image→Video and Lip-sync tasks, and queries task status — the "engine" the M4 queue/worker will drive.

**Architecture:** Pure, dependency-light building blocks, each unit-tested: a JWT signer (HS256 via Node `crypto`), request-body builders, and a response parser. A thin `KlingClient` class wires them to HTTP with an **injectable `fetch`** so the whole client is tested against a fake fetch — no real network calls. Per-account credentials are passed in by the caller (account storage is M4/M7, not here). No UI (backend infrastructure).

**Tech Stack:** TypeScript, Node `crypto` (HMAC-SHA256), `fetch`, Vitest. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-06-20-klingdom-forge-design.md` (§3 Kling integration)

**Verified API facts (official Kling docs):**
- Auth: JWT **HS256**, header `{alg:"HS256",typ:"JWT"}`, payload `{iss: <accessKey>, exp: now+1800, nbf: now-5}`, signed with the **secret key**; sent as `Authorization: Bearer <token>`. Base host `https://api.klingai.com`.
- `POST /v1/videos/image2video`, `POST /v1/videos/lip-sync`, query `GET /v1/videos/{kind}/{task_id}`.
- Response envelope: `{ code, message, request_id, data: { task_id, task_status: "submitted"|"processing"|"succeed"|"failed", task_status_msg?, task_result?: { videos: [{ id, url, duration }] }, created_at, updated_at } }`. `code === 0` means success.

---

## File Structure (this milestone)

```
src/lib/kling/
├── jwt.ts          # CREATE — signKlingJwt(accessKey, secretKey, nowSeconds) (TDD)
├── types.ts        # CREATE — params/result types + KlingError
├── payloads.ts     # CREATE — buildImage2VideoBody / buildLipSyncBody / parseTaskResponse (TDD)
├── client.ts       # CREATE — KlingClient (injectable fetch) (TDD with fake fetch)
└── index.ts        # CREATE — barrel + createKlingClient() factory
tests/
├── kling-jwt.test.ts
├── kling-payloads.test.ts
└── kling-client.test.ts
.env.example        # MODIFY — add optional KLING_BASE_URL
```

Responsibilities: `jwt.ts` = signing only. `types.ts` = shared types (no logic). `payloads.ts` = pure request/response shaping. `client.ts` = HTTP orchestration. `index.ts` = public surface. Everything pure is unit-tested; the client is tested with a fake `fetch`.

---

## Task 1: Kling JWT signer (TDD)

**Files:**
- Test: `tests/kling-jwt.test.ts`
- Create: `src/lib/kling/jwt.ts`

- [ ] **Step 1: Write the failing test `tests/kling-jwt.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signKlingJwt } from "@/lib/kling/jwt";

function decodeSegment(seg: string): Record<string, unknown> {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

const ak = "test-access-key";
const sk = "test-secret-key";
const now = 1_700_000_000;

describe("signKlingJwt", () => {
  it("produces a 3-part JWT with an HS256 header", () => {
    const parts = signKlingJwt(ak, sk, now).split(".");
    expect(parts).toHaveLength(3);
    expect(decodeSegment(parts[0])).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("sets iss=accessKey, exp=now+1800, nbf=now-5", () => {
    const payload = decodeSegment(signKlingJwt(ak, sk, now).split(".")[1]);
    expect(payload).toEqual({ iss: ak, exp: now + 1800, nbf: now - 5 });
  });

  it("signature is the HS256 HMAC of `header.payload` using the secret key", () => {
    const [h, p, sig] = signKlingJwt(ak, sk, now).split(".");
    const expected = createHmac("sha256", sk)
      .update(`${h}.${p}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(sig).toBe(expected);
  });

  it("a different secret key yields a different signature", () => {
    const a = signKlingJwt(ak, sk, now).split(".")[2];
    const b = signKlingJwt(ak, "other-secret", now).split(".")[2];
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `@/lib/kling/jwt`.

- [ ] **Step 3: Write `src/lib/kling/jwt.ts`**

```ts
import { createHmac } from "node:crypto";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Sign a Kling API JWT (HS256). Pass the current UNIX time in seconds as
 * `nowSeconds` (injected for deterministic testing). Token is valid for 30 min.
 */
export function signKlingJwt(
  accessKey: string,
  secretKey: string,
  nowSeconds: number,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: accessKey, exp: nowSeconds + 1800, nbf: nowSeconds - 5 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const signature = base64url(
    createHmac("sha256", secretKey).update(signingInput).digest(),
  );
  return `${signingInput}.${signature}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` → Expected: PASS — kling-jwt tests + all prior tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/kling-jwt.test.ts src/lib/kling/jwt.ts
git commit -m "feat(kling): HS256 JWT signer (TDD)"
```

---

## Task 2: Types + payload builders + response parser (TDD)

**Files:**
- Create: `src/lib/kling/types.ts`
- Test: `tests/kling-payloads.test.ts`
- Create: `src/lib/kling/payloads.ts`

- [ ] **Step 1: Create `src/lib/kling/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test `tests/kling-payloads.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `@/lib/kling/payloads`.

- [ ] **Step 4: Write `src/lib/kling/payloads.ts`**

```ts
import type { Image2VideoParams, LipSyncParams, KlingTask } from "./types";
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
  if (p.cfgScale !== undefined) body.cfg_scale = p.cfgScale;
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test` → Expected: PASS — payloads tests + all prior green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kling/types.ts tests/kling-payloads.test.ts src/lib/kling/payloads.ts
git commit -m "feat(kling): types + request builders + response parser (TDD)"
```

---

## Task 3: KlingClient with injectable fetch (TDD)

**Files:**
- Test: `tests/kling-client.test.ts`
- Create: `src/lib/kling/client.ts`

- [ ] **Step 1: Write the failing test `tests/kling-client.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `@/lib/kling/client`.

- [ ] **Step 3: Write `src/lib/kling/client.ts`**

```ts
import { signKlingJwt } from "./jwt";
import { buildImage2VideoBody, buildLipSyncBody, parseTaskResponse } from "./payloads";
import {
  KlingError,
  type Image2VideoParams,
  type LipSyncParams,
  type KlingTask,
} from "./types";

export type KlingTaskKind = "image2video" | "lip-sync";

/** Minimal fetch shape we depend on (injectable for testing). */
export type KlingFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type KlingClientOptions = {
  accessKey: string;
  secretKey: string;
  baseUrl?: string;
  fetchFn?: KlingFetch;
  nowSeconds?: () => number;
};

export class KlingClient {
  private readonly baseUrl: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly fetchFn: KlingFetch;
  private readonly nowSeconds: () => number;

  constructor(opts: KlingClientOptions) {
    this.accessKey = opts.accessKey;
    this.secretKey = opts.secretKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.klingai.com").replace(/\/+$/, "");
    this.fetchFn =
      opts.fetchFn ??
      ((url, init) =>
        fetch(url, init) as unknown as ReturnType<KlingFetch>);
    this.nowSeconds = opts.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  private authHeader(): string {
    return `Bearer ${signKlingJwt(this.accessKey, this.secretKey, this.nowSeconds())}`;
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<KlingTask> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      const message =
        (json as { message?: string } | null)?.message ?? `Kling HTTP ${res.status}`;
      throw new KlingError(message, (json as { code?: number } | null)?.code);
    }
    return parseTaskResponse(json);
  }

  createImage2Video(params: Image2VideoParams): Promise<KlingTask> {
    return this.request("POST", "/v1/videos/image2video", buildImage2VideoBody(params));
  }

  createLipSync(params: LipSyncParams): Promise<KlingTask> {
    return this.request("POST", "/v1/videos/lip-sync", buildLipSyncBody(params));
  }

  getTask(kind: KlingTaskKind, taskId: string): Promise<KlingTask> {
    return this.request("GET", `/v1/videos/${kind}/${encodeURIComponent(taskId)}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` → Expected: PASS — client tests + all prior green.

- [ ] **Step 5: Commit**

```bash
git add tests/kling-client.test.ts src/lib/kling/client.ts
git commit -m "feat(kling): KlingClient with injectable fetch (TDD)"
```

---

## Task 4: Public barrel + factory + env

**Files:**
- Create: `src/lib/kling/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create `src/lib/kling/index.ts`**

```ts
export { KlingClient } from "./client";
export type { KlingClientOptions, KlingTaskKind, KlingFetch } from "./client";
export { signKlingJwt } from "./jwt";
export { buildImage2VideoBody, buildLipSyncBody, parseTaskResponse } from "./payloads";
export * from "./types";

import { KlingClient } from "./client";

/**
 * Convenience factory. `baseUrl` falls back to env `KLING_BASE_URL`, then the
 * public host. Credentials come from the caller (per-account, stored in M4/M7).
 */
export function createKlingClient(opts: {
  accessKey: string;
  secretKey: string;
  baseUrl?: string;
}): KlingClient {
  return new KlingClient({
    accessKey: opts.accessKey,
    secretKey: opts.secretKey,
    baseUrl: opts.baseUrl ?? process.env.KLING_BASE_URL ?? "https://api.klingai.com",
  });
}
```

- [ ] **Step 2: Append to `.env.example`**

```
# Kling API (per-account keys are stored in the DB; this only overrides the host)
KLING_BASE_URL="https://api.klingai.com"
```

- [ ] **Step 3: Verify build + full test suite**

Run: `npm test` → Expected: all tests pass (health + auth-policy + access + kling-jwt + kling-payloads + kling-client).
Run: `npm run build` → Expected: compiles clean with no type errors. (No new routes — this is a library.)
Run: `npx tsc --noEmit` → Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kling/index.ts .env.example
git commit -m "feat(kling): public barrel + createKlingClient factory + KLING_BASE_URL"
```

---

## Done criteria for Milestone 3

- `src/lib/kling/` exports a `KlingClient` + `createKlingClient()` that can create Image→Video and Lip-sync tasks and query task status.
- JWT signing, payload building, and response parsing are each unit-tested; the client is tested end-to-end against a fake `fetch` (success, HTTP error, and non-zero-code paths).
- No real network calls in tests; no new npm dependencies.
- `npm test`, `npm run build`, `npx tsc --noEmit` all clean.

This hands Milestone 4 (queue + worker) a ready engine: the dispatcher constructs a `KlingClient` per Kling account and calls `createImage2Video`/`createLipSync`; the poller calls `getTask(kind, taskId)` until `succeed`/`failed`.

### Note on live verification
The exact `image2video`/`lip-sync` request field names and the query path shape are taken from the official docs but cannot be exercised against the real API without live account credentials (M4/M7). The client is structured so any field-name or path adjustment is a one-line change in `payloads.ts`/`client.ts`, fully covered by the unit tests. A real end-to-end call should be done once a Kling account key is configured in M4.
