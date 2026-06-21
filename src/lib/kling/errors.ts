import { KlingError } from "./types";

export type KlingErrorClass = "account" | "fatal" | "retry";

/**
 * How the worker should react to a failed Kling call:
 * - "account": the key/account is bad (auth) or out of credit → disable the account, requeue the job.
 * - "retry":   transient (rate/concurrency limit, server error, network) → requeue with backoff.
 * - "fatal":   won't succeed on retry (bad params, content policy, no model access, unknown) → fail the job and surface the reason.
 */
export function classifyKlingError(err: unknown): KlingErrorClass {
  if (err instanceof KlingError && typeof err.code === "number") {
    const c = err.code;
    // auth (bad/empty/invalid/expired key) or abnormal account → take the account offline
    if ([1000, 1001, 1002, 1004, 1100].includes(c)) return "account";
    // token-not-yet-valid, rate/concurrency limit, server errors → retry
    if ([1003, 1302, 1303, 5000, 5001, 5002].includes(c)) return "retry";
    // everything else (out of balance/credit 1101/1102, bad params, content policy,
    // no model access, IP whitelist, unknown) → fail the job with the reason, keep the account enabled
    return "fatal";
  }
  // network / unknown (no KlingError code) → transient
  return "retry";
}
