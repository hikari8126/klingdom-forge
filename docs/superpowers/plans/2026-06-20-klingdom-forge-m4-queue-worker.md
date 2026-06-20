# KlingDom Forge — Milestone 4: Queue + Worker (multi-account) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A central FIFO job queue with per-user/per-workspace in-flight caps, drawing from multiple Kling accounts, processed by an always-on worker (dispatcher + poller) with failover — plus a minimal Super-Admin page to register Kling accounts so the system is testable end-to-end.

**Architecture:** Jobs/batches/accounts live in Postgres. Kling secrets are encrypted at rest (AES-256-GCM). Pure decision helpers (account picking, cap checks) are unit-tested. The queue service enqueues jobs and claims them with `SELECT … FOR UPDATE SKIP LOCKED`. A standalone Node worker (run via `tsx`) drives the M3 `KlingClient` per account: a dispatcher submits queued jobs to an account with free capacity; a poller advances submitted/processing jobs to succeeded/failed. Account auth/credit errors auto-disable the account and requeue its in-flight jobs.

**Tech Stack:** Prisma 5 + Postgres (raw SQL for the lock), Node `crypto` (AES-256-GCM), `tsx` (worker runner — NEW devDep), the M3 `@/lib/kling` client, Vitest. Next.js for the admin page.

**Spec:** `docs/superpowers/specs/2026-06-20-klingdom-forge-design.md` (§3 queue, §4 data model).

**Builds on:** M1–M3 (on `main`). Reuses `db`, `requireUser`/`CurrentUser`, `access.ts`, `@/lib/kling` (`createKlingClient`, `KlingError`, `KlingTask`), UI kit.

---

## File Structure

```
prisma/schema.prisma                      # MODIFY — JobType/JobStatus enums; KlingAccount/Batch/Job; Project relations
src/lib/
├── crypto.ts                             # CREATE — encryptSecret/decryptSecret (AES-256-GCM) (TDD)
├── queue-policy.ts                       # CREATE — pure: pickAccount(), hasCapacity() (TDD)
├── kling-accounts.ts                     # CREATE — account CRUD (super_admin) + worker decrypt access
└── queue.ts                              # CREATE — enqueueJobs, claim (FOR UPDATE SKIP LOCKED), counts, status transitions
src/worker/
├── index.ts                              # CREATE — entrypoint: start dispatcher + poller loops
├── dispatcher.ts                         # CREATE — claim queued → submit to a free account
└── poller.ts                             # CREATE — advance submitted/processing → succeeded/failed
src/app/admin/kling-accounts/
├── page.tsx                              # CREATE — super_admin: list + add account
└── actions.ts                            # CREATE — createKlingAccountAction, setAccountEnabledAction
src/app/page.tsx                          # MODIFY — add admin link for super_admin
tests/
├── crypto.test.ts
└── queue-policy.test.ts
package.json                              # MODIFY — add tsx + worker scripts
.env.example                              # MODIFY — add KLING_ENC_KEY
```

---

## Task 1: Schema — KlingAccount, Batch, Job

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1: Append enums + models; add relations to `Project`.**

```prisma
enum JobType {
  image2video
  lipsync
}

enum JobStatus {
  queued
  submitted
  processing
  succeeded
  failed
}

model KlingAccount {
  id           String   @id @default(cuid())
  label        String
  accessKeyEnc String
  secretKeyEnc String
  maxConcurrent Int     @default(5)
  enabled      Boolean  @default(true)
  notes        String?
  createdAt    DateTime @default(now())
  jobs         Job[]
}

model Batch {
  id          String   @id @default(cuid())
  projectId   String
  createdById String
  source      String
  total       Int      @default(0)
  createdAt   DateTime @default(now())
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  jobs        Job[]
}

model Job {
  id              String        @id @default(cuid())
  projectId       String
  batchId         String?
  createdById     String
  type            JobType
  status          JobStatus     @default(queued)
  params          Json
  klingAccountId  String?
  klingTaskId     String?
  resultUrl       String?
  resultExpiresAt DateTime?
  error           String?
  attempts        Int           @default(0)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  project         Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  batch           Batch?        @relation(fields: [batchId], references: [id], onDelete: SetNull)
  klingAccount    KlingAccount? @relation(fields: [klingAccountId], references: [id])

  @@index([status])
  @@index([projectId])
}
```

Add to the existing `Project` model (before its closing brace):
```prisma
  batches Batch[]
  jobs    Job[]
```

- [ ] **Step 2:** Run `npx prisma migrate dev --name queue_jobs_accounts` (DB up). Expected: enums + 3 tables + indexes created; client regenerated.
- [ ] **Step 3:** Verify: `docker exec klingdom-forge-db psql -U forge -d klingdom_forge -c '\dt'` shows `KlingAccount`, `Batch`, `Job`.
- [ ] **Step 4:** `npm test` → 36 pass.
- [ ] **Step 5:** Commit:
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): KlingAccount, Batch, Job models + JobType/JobStatus enums"
```

---

## Task 2: Secret encryption (TDD)

**Files:** Test `tests/crypto.test.ts`; create `src/lib/crypto.ts`.

- [ ] **Step 1: Failing test `tests/crypto.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// 32-byte key as 64 hex chars
const key = "0".repeat(64);

describe("encryptSecret/decryptSecret", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("my-kling-secret", key);
    expect(enc).not.toContain("my-kling-secret");
    expect(decryptSecret(enc, key)).toBe("my-kling-secret");
  });

  it("produces different ciphertext each call (random IV)", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
  });

  it("throws when the ciphertext is tampered", () => {
    const enc = encryptSecret("secret", key);
    const tampered = enc.slice(0, -2) + (enc.endsWith("a") ? "bb" : "aa");
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const enc = encryptSecret("secret", key);
    expect(() => decryptSecret(enc, "1".repeat(64))).toThrow();
  });
});
```

- [ ] **Step 2:** `npm test` → FAIL (no `@/lib/crypto`).
- [ ] **Step 3: Implement `src/lib/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM. `keyHex` is 64 hex chars (32 bytes). Output: hex iv:tag:ciphertext. */
export function encryptSecret(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

export function decryptSecret(enc: string, keyHex: string): string {
  const [ivHex, tagHex, ctHex] = enc.split(":");
  if (!ivHex || !tagHex || !ctHex) throw new Error("Malformed ciphertext");
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Reads the app encryption key from env (64 hex chars). Throws if missing/invalid. */
export function getEncKey(): string {
  const k = process.env.KLING_ENC_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error("KLING_ENC_KEY must be 64 hex chars (32 bytes)");
  }
  return k;
}
```

- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Append to `.env.example`:
```
# 32-byte hex key for encrypting Kling account secrets at rest (generate: openssl rand -hex 32)
KLING_ENC_KEY=""
```
Also add a dev value to local `.env` (gitignored): `KLING_ENC_KEY="<openssl rand -hex 32 output>"` — run `openssl rand -hex 32` and paste; this is needed so the worker/admin can run locally.
- [ ] **Step 6:** Commit:
```bash
git add tests/crypto.test.ts src/lib/crypto.ts .env.example
git commit -m "feat(crypto): AES-256-GCM secret encryption (TDD)"
```

---

## Task 3: Queue decision helpers (TDD)

**Files:** Test `tests/queue-policy.test.ts`; create `src/lib/queue-policy.ts`.

- [ ] **Step 1: Failing test `tests/queue-policy.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { pickAccount, type AccountLoad } from "@/lib/queue-policy";

describe("pickAccount", () => {
  const accounts: AccountLoad[] = [
    { id: "a", maxConcurrent: 2, inFlight: 2 }, // full
    { id: "b", maxConcurrent: 3, inFlight: 1 }, // 2 free
    { id: "c", maxConcurrent: 3, inFlight: 2 }, // 1 free
  ];

  it("returns the account with the most free capacity", () => {
    expect(pickAccount(accounts)?.id).toBe("b");
  });

  it("returns null when every account is at capacity", () => {
    expect(
      pickAccount([{ id: "a", maxConcurrent: 1, inFlight: 1 }]),
    ).toBeNull();
  });

  it("ignores accounts with no free slots and picks among the rest", () => {
    expect(
      pickAccount([
        { id: "a", maxConcurrent: 1, inFlight: 1 },
        { id: "c", maxConcurrent: 3, inFlight: 2 },
      ])?.id,
    ).toBe("c");
  });

  it("returns null for an empty list", () => {
    expect(pickAccount([])).toBeNull();
  });
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implement `src/lib/queue-policy.ts`**

```ts
export type AccountLoad = {
  id: string;
  maxConcurrent: number;
  inFlight: number;
};

/** Pick the enabled account with the most free capacity, or null if none free. */
export function pickAccount(accounts: AccountLoad[]): AccountLoad | null {
  let best: AccountLoad | null = null;
  let bestFree = 0;
  for (const a of accounts) {
    const free = a.maxConcurrent - a.inFlight;
    if (free > bestFree) {
      bestFree = free;
      best = a;
    }
  }
  return best;
}
```

- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit:
```bash
git add tests/queue-policy.test.ts src/lib/queue-policy.ts
git commit -m "feat(queue): pure account-picking policy (TDD)"
```

---

## Task 4: Kling account service

**Files:** Create `src/lib/kling-accounts.ts`.

- [ ] **Step 1: Implement `src/lib/kling-accounts.ts`**

```ts
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { ForbiddenError } from "@/lib/workspaces";
import { encryptSecret, decryptSecret, getEncKey } from "@/lib/crypto";

function assertSuperAdmin(actor: CurrentUser) {
  if (actor.role !== "super_admin") throw new ForbiddenError();
}

/** Safe listing for the admin UI — never returns secrets. */
export async function listAccountsForAdmin(actor: CurrentUser) {
  assertSuperAdmin(actor);
  return db.klingAccount.findMany({
    select: { id: true, label: true, maxConcurrent: true, enabled: true, notes: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createKlingAccount(
  actor: CurrentUser,
  input: { label: string; accessKey: string; secretKey: string; maxConcurrent?: number },
) {
  assertSuperAdmin(actor);
  const key = getEncKey();
  const label = input.label.trim();
  if (!label) throw new Error("Label is required");
  if (!input.accessKey.trim() || !input.secretKey.trim()) {
    throw new Error("Access key and secret key are required");
  }
  return db.klingAccount.create({
    data: {
      label,
      accessKeyEnc: encryptSecret(input.accessKey.trim(), key),
      secretKeyEnc: encryptSecret(input.secretKey.trim(), key),
      maxConcurrent: input.maxConcurrent && input.maxConcurrent > 0 ? input.maxConcurrent : 5,
    },
    select: { id: true, label: true },
  });
}

export async function setAccountEnabled(actor: CurrentUser, id: string, enabled: boolean) {
  assertSuperAdmin(actor);
  await db.klingAccount.update({ where: { id }, data: { enabled } });
}

/** Worker-side: enabled accounts with DECRYPTED credentials. Not for any request handler. */
export async function listEnabledAccountsDecrypted() {
  const key = getEncKey();
  const rows = await db.klingAccount.findMany({ where: { enabled: true } });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    maxConcurrent: r.maxConcurrent,
    accessKey: decryptSecret(r.accessKeyEnc, key),
    secretKey: decryptSecret(r.secretKeyEnc, key),
  }));
}
```

- [ ] **Step 2:** `npm run build` → clean. `npm test` → still pass.
- [ ] **Step 3:** Commit:
```bash
git add src/lib/kling-accounts.ts
git commit -m "feat(accounts): Kling account service (super_admin CRUD, encrypted; worker decrypt)"
```

---

## Task 5: Queue service (enqueue, claim, counts, transitions)

**Files:** Create `src/lib/queue.ts`.

- [ ] **Step 1: Implement `src/lib/queue.ts`**

```ts
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import type { JobType, Job } from "@prisma/client";
import { ForbiddenError } from "@/lib/workspaces";
import { canCreateProject, type Membership } from "@/lib/access";

const MAX_IN_FLIGHT_PER_USER = Number(process.env.MAX_IN_FLIGHT_PER_USER ?? 10);

async function membershipFor(workspaceId: string, userId: string): Promise<Membership> {
  return db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
}

/** Create a batch + queued jobs in a project. Caller must be able to create projects there. */
export async function enqueueJobs(
  actor: CurrentUser,
  projectId: string,
  type: JobType,
  source: string,
  paramsList: Array<Record<string, unknown>>,
) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  const membership =
    actor.role === "super_admin" ? null : await membershipFor(project.workspaceId, actor.id);
  if (!canCreateProject(actor.role, membership)) throw new ForbiddenError();
  if (paramsList.length === 0) throw new Error("No jobs to enqueue");

  return db.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: { projectId, createdById: actor.id, source, total: paramsList.length },
    });
    await tx.job.createMany({
      data: paramsList.map((params) => ({
        projectId,
        batchId: batch.id,
        createdById: actor.id,
        type,
        params: params as object,
      })),
    });
    return batch;
  });
}

/** In-flight (submitted+processing) job count for a user. */
export async function inFlightForUser(userId: string): Promise<number> {
  return db.job.count({
    where: { createdById: userId, status: { in: ["submitted", "processing"] } },
  });
}

/** In-flight count per Kling account (for the dispatcher). */
export async function inFlightByAccount(): Promise<Record<string, number>> {
  const rows = await db.job.groupBy({
    by: ["klingAccountId"],
    where: { status: { in: ["submitted", "processing"] }, klingAccountId: { not: null } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) if (r.klingAccountId) out[r.klingAccountId] = r._count._all;
  return out;
}

/**
 * Atomically claim one queued job whose owner is under the per-user cap, marking it
 * `submitted` (the account id is attached by the dispatcher right after). Uses
 * FOR UPDATE SKIP LOCKED so concurrent workers never grab the same row.
 * Returns the claimed job id, or null if none claimable.
 */
export async function claimNextQueuedJob(): Promise<string | null> {
  const cap = MAX_IN_FLIGHT_PER_USER;
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    WITH next AS (
      SELECT j.id
      FROM "Job" j
      WHERE j.status = 'queued'
        AND (
          SELECT COUNT(*) FROM "Job" f
          WHERE f."createdById" = j."createdById"
            AND f.status IN ('submitted','processing')
        ) < ${cap}
      ORDER BY j."createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "Job" SET status = 'submitted', "updatedAt" = NOW()
    WHERE id IN (SELECT id FROM next)
    RETURNING id;
  `;
  return rows[0]?.id ?? null;
}

export async function attachAccountAndTask(jobId: string, klingAccountId: string, klingTaskId: string) {
  await db.job.update({ where: { id: jobId }, data: { klingAccountId, klingTaskId } });
}

/** Revert a claimed job to queued (e.g. submit failed / account unavailable). */
export async function requeueJob(jobId: string, error?: string) {
  await db.job.update({
    where: { id: jobId },
    data: { status: "queued", klingAccountId: null, klingTaskId: null, error: error ?? null, attempts: { increment: 1 } },
  });
}

export async function getJob(jobId: string): Promise<Job | null> {
  return db.job.findUnique({ where: { id: jobId } });
}

/** Jobs currently submitted/processing (for the poller). */
export async function listActiveJobs(): Promise<Job[]> {
  return db.job.findMany({ where: { status: { in: ["submitted", "processing"] } } });
}

export async function markProcessing(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { status: "processing" } });
}

export async function markSucceeded(jobId: string, resultUrl: string) {
  await db.job.update({
    where: { id: jobId },
    data: { status: "succeeded", resultUrl, error: null },
  });
}

export async function markFailed(jobId: string, error: string) {
  await db.job.update({ where: { id: jobId }, data: { status: "failed", error } });
}
```

- [ ] **Step 2:** `npm run build` → clean (verifies the raw-SQL generic + Prisma types). `npm test` → pass.
- [ ] **Step 3:** Commit:
```bash
git add src/lib/queue.ts
git commit -m "feat(queue): enqueue + FOR UPDATE SKIP LOCKED claim + status transitions"
```

---

## Task 6: Worker (dispatcher + poller) + runner

**Files:** Create `src/worker/dispatcher.ts`, `src/worker/poller.ts`, `src/worker/index.ts`; modify `package.json`; add `tsx`.

- [ ] **Step 1: Add `tsx` and worker scripts.** Run `npm install -D tsx`. Then add to `package.json` scripts:
```
    "worker": "tsx src/worker/index.ts",
    "worker:dev": "tsx watch src/worker/index.ts"
```

- [ ] **Step 2: `src/worker/dispatcher.ts`**

```ts
import { createKlingClient, KlingError, type Image2VideoParams, type LipSyncParams } from "@/lib/kling";
import { pickAccount, type AccountLoad } from "@/lib/queue-policy";
import { listEnabledAccountsDecrypted, setAccountEnabled } from "@/lib/kling-accounts";
import {
  claimNextQueuedJob,
  inFlightByAccount,
  attachAccountAndTask,
  requeueJob,
  getJob,
} from "@/lib/queue";

const SYSTEM_ACTOR = { id: "system", email: "", name: null, image: null, role: "super_admin" as const };

/** One dispatch tick: claim a queued job and submit it to a free account. Returns true if it did work. */
export async function dispatchOnce(): Promise<boolean> {
  const accounts = await listEnabledAccountsDecrypted();
  if (accounts.length === 0) return false;

  const inFlight = await inFlightByAccount();
  const loads: AccountLoad[] = accounts.map((a) => ({
    id: a.id,
    maxConcurrent: a.maxConcurrent,
    inFlight: inFlight[a.id] ?? 0,
  }));
  const chosen = pickAccount(loads);
  if (!chosen) return false; // all accounts full

  const jobId = await claimNextQueuedJob();
  if (!jobId) return false; // nothing queued (or all owners over cap)

  const job = await getJob(jobId);
  if (!job) return false;
  const account = accounts.find((a) => a.id === chosen.id)!;
  const client = createKlingClient({ accessKey: account.accessKey, secretKey: account.secretKey });

  try {
    const task =
      job.type === "image2video"
        ? await client.createImage2Video(job.params as unknown as Image2VideoParams)
        : await client.createLipSync(job.params as unknown as LipSyncParams);
    await attachAccountAndTask(jobId, account.id, task.taskId);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Auth/credit failures disable the account; otherwise just requeue this job.
    if (e instanceof KlingError && (e.code === 1000 || e.code === 1101 || e.code === 1102 || e.code === 1103)) {
      await setAccountEnabled(SYSTEM_ACTOR, account.id, false);
    }
    await requeueJob(jobId, msg);
    return true;
  }
}
```

- [ ] **Step 3: `src/worker/poller.ts`**

```ts
import { createKlingClient, KlingError } from "@/lib/kling";
import { listEnabledAccountsDecrypted } from "@/lib/kling-accounts";
import { listActiveJobs, markProcessing, markSucceeded, markFailed } from "@/lib/queue";

/** One poll tick: advance each active job by querying Kling. */
export async function pollOnce(): Promise<void> {
  const jobs = await listActiveJobs();
  if (jobs.length === 0) return;
  const accounts = await listEnabledAccountsDecrypted();
  const byId = new Map(accounts.map((a) => [a.id, a]));

  for (const job of jobs) {
    if (!job.klingAccountId || !job.klingTaskId) continue;
    const account = byId.get(job.klingAccountId);
    if (!account) continue; // account disabled; leave for now
    const client = createKlingClient({ accessKey: account.accessKey, secretKey: account.secretKey });
    const kind = job.type === "image2video" ? "image2video" : "lip-sync";
    try {
      const task = await client.getTask(kind, job.klingTaskId);
      if (task.status === "succeed" && task.videoUrl) {
        await markSucceeded(job.id, task.videoUrl);
      } else if (task.status === "failed") {
        await markFailed(job.id, task.statusMessage ?? "Kling task failed");
      } else if (task.status === "processing" && job.status !== "processing") {
        await markProcessing(job.id);
      }
      // "submitted"/unknown: leave as-is for the next tick
    } catch (e) {
      if (e instanceof KlingError) continue; // transient; retry next tick
      continue;
    }
  }
}
```

- [ ] **Step 4: `src/worker/index.ts`**

```ts
import { dispatchOnce } from "./dispatcher";
import { pollOnce } from "./poller";

const DISPATCH_INTERVAL = Number(process.env.WORKER_DISPATCH_MS ?? 2000);
const POLL_INTERVAL = Number(process.env.WORKER_POLL_MS ?? 5000);

let running = true;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function dispatchLoop() {
  while (running) {
    try {
      // Drain as many claimable jobs as capacity allows this tick.
      let worked = true;
      while (worked) worked = await dispatchOnce();
    } catch (e) {
      console.error("[dispatch] error:", e);
    }
    await sleep(DISPATCH_INTERVAL);
  }
}

async function pollLoop() {
  while (running) {
    try {
      await pollOnce();
    } catch (e) {
      console.error("[poll] error:", e);
    }
    await sleep(POLL_INTERVAL);
  }
}

function shutdown() {
  running = false;
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[worker] KlingDom Forge worker started");
void Promise.all([dispatchLoop(), pollLoop()]);
```

- [ ] **Step 5: Verify the worker boots and resolves the `@/` alias under tsx.**
Run (DB up, `.env` has KLING_ENC_KEY): `timeout 5 npm run worker; echo "exit=$?"` (or run `npm run worker` in the background for ~5s then kill).
Expected: prints `[worker] KlingDom Forge worker started` and does NOT crash on import (no "Cannot find module '@/...'"). With zero Kling accounts it simply idles (`dispatchOnce` returns false).
If `@/` does NOT resolve under tsx, fix by adding a `tsconfig.json` for the worker OR installing `tsconfig-paths` and prefixing the scripts with `node --import tsx --import tsconfig-paths/register` — report what you did. (tsx generally honors tsconfig `paths`.)
Then `npm run build` → clean (Next build ignores src/worker since it's not imported by the app, but confirm no type errors leak).

- [ ] **Step 6:** Commit:
```bash
git add package.json package-lock.json src/worker
git commit -m "feat(worker): dispatcher + poller loops with multi-account dispatch + failover"
```

---

## Task 7: Super-Admin Kling-accounts page (so the system is testable)

**Files:** Create `src/app/admin/kling-accounts/actions.ts` + `page.tsx`; modify `src/app/page.tsx`.

- [ ] **Step 1: `src/app/admin/kling-accounts/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createKlingAccount, setAccountEnabled } from "@/lib/kling-accounts";

export async function createKlingAccountAction(formData: FormData) {
  const actor = await requireUser();
  await createKlingAccount(actor, {
    label: String(formData.get("label") ?? ""),
    accessKey: String(formData.get("accessKey") ?? ""),
    secretKey: String(formData.get("secretKey") ?? ""),
    maxConcurrent: Number(formData.get("maxConcurrent") ?? 5),
  });
  revalidatePath("/admin/kling-accounts");
}

export async function setAccountEnabledAction(formData: FormData) {
  const actor = await requireUser();
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await setAccountEnabled(actor, id, enabled);
  revalidatePath("/admin/kling-accounts");
}
```

- [ ] **Step 2: `src/app/admin/kling-accounts/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listAccountsForAdmin } from "@/lib/kling-accounts";
import { Card, PageHeader, Button, TextInput } from "@/components/ui";
import { createKlingAccountAction, setAccountEnabledAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function KlingAccountsPage() {
  const user = await requireUser();
  if (user.role !== "super_admin") notFound();
  const accounts = await listAccountsForAdmin(user);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader title="Kling Accounts" subtitle="Khoá API Kling dùng chung (chỉ Super Admin)" />

      <Card className="mt-8">
        <form action={createKlingAccountAction} className="grid gap-2">
          <TextInput name="label" placeholder="Nhãn (vd: KlingAccount #1)" required />
          <TextInput name="accessKey" placeholder="Access Key" required />
          <TextInput name="secretKey" placeholder="Secret Key" required />
          <TextInput name="maxConcurrent" type="number" defaultValue={5} min={1} placeholder="Max concurrent" />
          <Button type="submit">Thêm account</Button>
        </form>
      </Card>

      <div className="mt-4 space-y-2">
        {accounts.length === 0 && (
          <Card><p className="text-muted">Chưa có account nào. Thêm khoá Kling để bắt đầu tạo video.</p></Card>
        )}
        {accounts.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between">
              <span className="text-white">
                {a.label}{" "}
                <span className="text-muted">· max {a.maxConcurrent} ·</span>{" "}
                <span className={a.enabled ? "text-ok" : "text-bad"}>{a.enabled ? "bật" : "tắt"}</span>
              </span>
              <form action={setAccountEnabledAction}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="enabled" value={a.enabled ? "false" : "true"} />
                <Button variant="ghost" type="submit">{a.enabled ? "Tắt" : "Bật"}</Button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Add a super-admin link in `src/app/page.tsx`.** After the existing `<Link href="/workspaces">…</Link>` block, add:
```tsx
      {user.role === "super_admin" && (
        <Link href="/admin/kling-accounts" className="mt-4 ml-2 inline-block">
          <Button variant="ghost">Kling Accounts</Button>
        </Link>
      )}
```
(`user` and `Link` are already in scope from M2b.)

- [ ] **Step 4:** `npm test` → pass. `npm run build` → clean; routes `/admin/kling-accounts` present. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Runtime smoke:** start dev on a free port, `curl` `/admin/kling-accounts` unauthenticated → expect 302 to /login; check logs clean; kill server, free the port. (Leave port 3000 free.)
- [ ] **Step 6:** Commit:
```bash
git add "src/app/admin/kling-accounts/actions.ts" "src/app/admin/kling-accounts/page.tsx" src/app/page.tsx
git commit -m "feat(admin): super-admin Kling accounts page (add/enable/disable)"
```

---

## Done criteria for Milestone 4

- `KlingAccount`/`Batch`/`Job` tables + enums exist (migration committed); secrets encrypted at rest.
- `encryptSecret`/`decryptSecret` and `pickAccount` unit-tested.
- `enqueueJobs` creates queued jobs (access-gated); `claimNextQueuedJob` claims atomically with FOR UPDATE SKIP LOCKED respecting the per-user cap.
- Worker boots under `tsx`, idles with no accounts, and (with accounts + queued jobs) submits to a free account and polls to terminal status; account auth/credit errors disable the account and requeue.
- Super-admin can add/enable/disable Kling accounts in the UI.
- `npm test`, `npm run build`, `npx tsc --noEmit` clean.

This makes M5's batch composer fully testable: compose → `enqueueJobs` → worker processes against a real Kling account → job rows reach `succeeded` with a `resultUrl`.

### Known limitations (deliberate, for a later refinement — not bugs)
- **Per-workspace in-flight cap not yet enforced in the claim.** `claimNextQueuedJob` enforces the **per-user** cap (`MAX_IN_FLIGHT_PER_USER`) and the per-account concurrency (via `pickAccount`). The spec also wants a per-**workspace** cap (`Workspace.maxInFlight`); the column exists but is not yet joined into the claim SQL. Add it when needed (count active jobs whose project belongs to the same workspace, compare to `Workspace.maxInFlight`).
- **Failover error codes are heuristic.** The dispatcher disables an account on a small set of Kling error codes; tune these once observed against the live API.
- **No abort/timeout on Kling calls yet** (M3 note): a hung request blocks that worker tick. Acceptable at current scale; add an AbortController to `KlingFetch` if it bites.
