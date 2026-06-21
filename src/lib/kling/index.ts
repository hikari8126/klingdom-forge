export { KlingClient } from "./client";
export type { KlingClientOptions, KlingTaskKind, KlingFetch } from "./client";
export { signKlingJwt } from "./jwt";
export { buildImage2VideoBody, buildLipSyncBody, buildMotionControlBody, parseTaskResponse } from "./payloads";
export * from "./types";

import { KlingClient } from "./client";
import type { KlingClientOptions } from "./client";

/**
 * Convenience factory. `baseUrl` falls back to env `KLING_BASE_URL`, then the
 * public host. Credentials come from the caller (per-account, stored in M4/M7).
 */
export function createKlingClient(opts: {
  accessKey: string;
  secretKey?: string;
  baseUrl?: string;
}): KlingClient {
  return new KlingClient({
    accessKey: opts.accessKey,
    secretKey: opts.secretKey,
    baseUrl: opts.baseUrl ?? process.env.KLING_BASE_URL ?? "https://api-singapore.klingai.com",
  });
}
