import { signKlingJwt } from "./jwt";
import { buildAvatarBody, buildImage2VideoBody, buildLipSyncBody, buildMotionControlBody, parseTaskResponse } from "./payloads";
import {
  KlingError,
  type AvatarParams,
  type Image2VideoParams,
  type LipSyncParams,
  type MotionControlParams,
  type KlingTask,
} from "./types";

export type KlingTaskKind = "image2video" | "lip-sync" | "motion-control" | "avatar";

/** Minimal fetch shape we depend on (injectable for testing). */
export type KlingFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type KlingClientOptions = {
  /** API Key (new auth) OR Access Key (legacy, paired with secretKey). */
  accessKey: string;
  /** Legacy Secret Key. Omit for the new single-API-key auth. */
  secretKey?: string;
  baseUrl?: string;
  fetchFn?: KlingFetch;
  nowSeconds?: () => number;
};

export class KlingClient {
  private readonly baseUrl: string;
  private readonly accessKey: string;
  private readonly secretKey?: string;
  private readonly fetchFn: KlingFetch;
  private readonly nowSeconds: () => number;

  constructor(opts: KlingClientOptions) {
    this.accessKey = opts.accessKey;
    this.secretKey = opts.secretKey;
    this.baseUrl = (opts.baseUrl ?? "https://api-singapore.klingai.com").replace(/\/+$/, "");
    this.fetchFn =
      opts.fetchFn ??
      ((url, init) => fetch(url, init) as unknown as ReturnType<KlingFetch>);
    this.nowSeconds = opts.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  // New auth: the accessKey IS the API key → Bearer <key>.
  // Legacy auth: sign a JWT from accessKey + secretKey.
  private authHeader(): string {
    const token = this.secretKey
      ? signKlingJwt(this.accessKey, this.secretKey, this.nowSeconds())
      : this.accessKey;
    return `Bearer ${token}`;
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

  createMotionControl(params: MotionControlParams): Promise<KlingTask> {
    return this.request("POST", "/v1/videos/motion-control", buildMotionControlBody(params));
  }

  createAvatar(params: AvatarParams): Promise<KlingTask> {
    return this.request("POST", "/v1/videos/avatar/image2video", buildAvatarBody(params));
  }

  getTask(kind: KlingTaskKind, taskId: string): Promise<KlingTask> {
    const encoded = encodeURIComponent(taskId);
    if (kind === "avatar") {
      return this.request("GET", `/v1/videos/avatar/image2video/${encoded}`);
    }
    return this.request("GET", `/v1/videos/${kind}/${encoded}`);
  }
}
