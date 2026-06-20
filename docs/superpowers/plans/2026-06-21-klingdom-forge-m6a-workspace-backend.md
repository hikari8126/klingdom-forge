# KlingDom Forge — Milestone 6a: Workspace Backend (for the new canvas UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Back-end support for the new canvas workspace UX (prototype locked at artifact v7): persisted **image assets** (uploaded to disk), **draft "cells"** (jobs you configure before generating), per-cell **generate** (draft → queued), **variant** duplication, and a worker that resolves a stored image **path → base64** at submit time.

**Architecture:** Uploaded images are written to a disk folder (`UPLOAD_DIR`), tracked by an `Asset` row; `job.params` stores the file **path**, not base64 (keeps Postgres lean). A new `draft` `JobStatus` lets a cell exist and be edited before it enters the queue. A `cells` service does access-gated CRUD + generate + duplicate on draft/real jobs. The M4 worker dispatcher is updated to read the image file(s) → base64 just before calling the Kling client. Pure path/extension helpers are unit-tested.

**Tech Stack:** Prisma 5 + Postgres, Node `fs`, the M3 Kling client, the M4 queue/worker, Vitest. No new npm deps.

**Spec:** prototype `scratchpad/kdf-workspace.html` (artifact v7) + design spec §5/§6. Image-storage decision: **disk + path; base64 at submit**.

**Builds on:** M1–M5 (on `main`). Reuses `db`, `requireUser`/`CurrentUser`, `access.ts` (`canAccessWorkspace`/`canCreateProject`), `getProjectForUser` (projects.ts), the M4 `queue.ts` + `src/worker/*`, and `@/lib/kling`.

> **Out of scope (deferred to M6b / later):** all React UI (that's M6b); the "press Generate N times → list of N videos per cell" history (this milestone keeps one `resultUrl` per job — note kept in memory).

---

## File Structure

```
prisma/schema.prisma                 # MODIFY — JobStatus + 'draft'; Asset model; Project.assets relation
src/lib/
├── uploads.ts                        # CREATE — disk paths + safe extension + read-as-base64 (pure parts TDD)
├── assets.ts                         # CREATE — createAsset / listAssets (access-gated, writes to disk + DB)
└── cells.ts                          # CREATE — draft-job CRUD: create/update/delete/duplicate/generate/list
src/worker/dispatcher.ts              # MODIFY — resolve params.imagePath/endPath → base64 before submit
tests/
└── uploads.test.ts                   # CREATE — unit tests for safeExt / asset path building
.env.example                          # MODIFY — add UPLOAD_DIR
.gitignore                            # MODIFY — ignore /uploads
```

### Stored cell `job.params` shape (image2video)
```jsonc
{
  "imagePath": "/abs/uploads/<projectId>/<assetId>.jpg",  // start frame (required)
  "endPath":   "/abs/uploads/<projectId>/<assetId>.png",  // optional end frame
  "prompt":    "…",            // optional
  "modelName": "kling-v2",
  "mode":      "std" | "pro",
  "duration":  "5" | "10"
}
```

---

## Task 1: Schema — Asset model + `draft` status

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1:** Add `draft` as the FIRST value of the `JobStatus` enum:
```prisma
enum JobStatus {
  draft
  queued
  submitted
  processing
  succeeded
  failed
}
```

- [ ] **Step 2:** Add the `Asset` model and a `Project.assets` relation:
```prisma
model Asset {
  id         String   @id @default(cuid())
  projectId  String
  filename   String
  storedPath String
  createdAt  DateTime @default(now())
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}
```
Add to the existing `Project` model (before its closing brace): `  assets Asset[]`

- [ ] **Step 3:** `npx prisma migrate dev --name assets_and_draft_status` (DB up). Expected: `Asset` table + `draft` added to the `JobStatus` enum; client regenerated.
- [ ] **Step 4:** Verify: `docker exec klingdom-forge-db psql -U forge -d klingdom_forge -c "\dt"` shows `Asset`; `... -c "SELECT unnest(enum_range(NULL::\"JobStatus\"))"` includes `draft`.
- [ ] **Step 5:** `npm test` → all prior tests pass (44).
- [ ] **Step 6:** Commit:
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): Asset model + draft JobStatus"
```

---

## Task 2: Upload helpers (TDD pure parts)

**Files:** Test `tests/uploads.test.ts`; create `src/lib/uploads.ts`; modify `.env.example`, `.gitignore`.

- [ ] **Step 1: Failing test `tests/uploads.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { safeExt, assetStoredPath } from "@/lib/uploads";

describe("safeExt", () => {
  it("keeps common image extensions (lowercased)", () => {
    expect(safeExt("photo.JPG")).toBe(".jpg");
    expect(safeExt("a.png")).toBe(".png");
    expect(safeExt("x.webp")).toBe(".webp");
  });
  it("falls back to .png for unknown/missing extensions", () => {
    expect(safeExt("noext")).toBe(".png");
    expect(safeExt("evil.svg")).toBe(".png");
    expect(safeExt("a.exe")).toBe(".png");
  });
});

describe("assetStoredPath", () => {
  it("builds <root>/<projectId>/<assetId><ext> and never escapes via input", () => {
    const p = assetStoredPath("/data/up", "proj1", "asset9", "pic.jpeg");
    expect(p).toBe("/data/up/proj1/asset9.jpeg");
  });
  it("sanitizes a traversal attempt in the filename's extension", () => {
    const p = assetStoredPath("/data/up", "proj1", "asset9", "../../etc/passwd");
    // no real extension → .png; ids are app-generated so the path stays inside root
    expect(p).toBe("/data/up/proj1/asset9.png");
  });
});
```

- [ ] **Step 2:** `npm test` → FAIL (`@/lib/uploads` missing).
- [ ] **Step 3: Implement `src/lib/uploads.ts`**
```ts
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/** Root folder for uploaded images. */
export function uploadRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

/** Allow only known image extensions; fall back to .png. (.jpeg preserved.) */
export function safeExt(filename: string): string {
  const e = path.extname(filename).toLowerCase();
  return /^\.(png|jpg|jpeg|webp|gif)$/.test(e) ? e : ".png";
}

/** Deterministic on-disk path for an asset. ids are app-generated (cuid), so the
 *  path cannot escape `root` regardless of the original filename. */
export function assetStoredPath(root: string, projectId: string, assetId: string, filename: string): string {
  return path.join(root, projectId, assetId + safeExt(filename));
}

/** Write bytes to disk and return the stored absolute path. */
export async function saveUpload(projectId: string, assetId: string, filename: string, bytes: Buffer): Promise<string> {
  const root = uploadRoot();
  await mkdir(path.join(root, projectId), { recursive: true });
  const stored = assetStoredPath(root, projectId, assetId, filename);
  await writeFile(stored, bytes);
  return stored;
}

/** Read a stored file and return raw base64 (no data: prefix) for Kling. */
export async function fileToBase64(storedPath: string): Promise<string> {
  return (await readFile(storedPath)).toString("base64");
}
```

- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Append to `.env.example`:
```
# Folder where uploaded source images are stored (path is kept in the DB, file on disk)
UPLOAD_DIR=""
```
And add to `.gitignore`: a line `/uploads`.
- [ ] **Step 6:** Commit:
```bash
git add tests/uploads.test.ts src/lib/uploads.ts .env.example .gitignore
git commit -m "feat(uploads): disk storage helpers (safeExt, paths, base64) (TDD)"
```

---

## Task 3: Asset service

**Files:** Create `src/lib/assets.ts`.

- [ ] **Step 1: Implement `src/lib/assets.ts`**
```ts
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { ForbiddenError } from "@/lib/workspaces";
import { saveUpload } from "@/lib/uploads";

/** Save an uploaded image to disk + DB, scoped to a project the actor can access. */
export async function createAsset(
  actor: CurrentUser,
  projectId: string,
  filename: string,
  bytes: Buffer,
) {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  const id = (await db.asset.create({ data: { projectId, filename, storedPath: "" } })).id;
  const storedPath = await saveUpload(projectId, id, filename, bytes);
  return db.asset.update({ where: { id }, data: { storedPath }, select: { id: true, filename: true, storedPath: true } });
}

/** List a project's assets (newest first) if the actor can access it. */
export async function listAssets(actor: CurrentUser, projectId: string) {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  return db.asset.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, storedPath: true, createdAt: true },
  });
}

/** Internal: resolve an asset's stored path (worker/cell use). */
export async function assetPath(assetId: string): Promise<string | null> {
  const a = await db.asset.findUnique({ where: { id: assetId }, select: { storedPath: true } });
  return a?.storedPath ?? null;
}
```

- [ ] **Step 2:** `npm run build` → clean. `npm test` → pass.
- [ ] **Step 3:** Commit:
```bash
git add src/lib/assets.ts
git commit -m "feat(assets): project image asset service (disk + DB, access-gated)"
```

---

## Task 4: Cell service (draft jobs)

**Files:** Create `src/lib/cells.ts`.

- [ ] **Step 1: Implement `src/lib/cells.ts`**
```ts
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import type { Job } from "@prisma/client";
import { getProjectForUser } from "@/lib/projects";
import { canCreateProject } from "@/lib/access";
import { ForbiddenError } from "@/lib/workspaces";
import { assetPath } from "@/lib/assets";

export type CellParams = {
  imagePath: string;
  endPath?: string;
  prompt?: string;
  modelName: string;
  mode: "std" | "pro";
  duration: "5" | "10";
};

async function assertCanEdit(actor: CurrentUser, projectId: string) {
  const access = await getProjectForUser(actor, projectId);
  if (!access || !canCreateProject(actor.role, access.membership)) throw new ForbiddenError();
}

/** All cells (jobs of any status, incl. draft) in a project, oldest first. */
export async function listCells(actor: CurrentUser, projectId: string): Promise<Job[]> {
  const access = await getProjectForUser(actor, projectId);
  if (!access) throw new ForbiddenError();
  return db.job.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

/** Create a draft cell from a start-image asset. */
export async function createCell(
  actor: CurrentUser,
  projectId: string,
  startAssetId: string,
) {
  await assertCanEdit(actor, projectId);
  const imagePath = await assetPath(startAssetId);
  if (!imagePath) throw new Error("Ảnh không tồn tại");
  const params: CellParams = { imagePath, modelName: "kling-v2", mode: "std", duration: "5" };
  return db.job.create({
    data: { projectId, createdById: actor.id, type: "image2video", status: "draft", params: params as object },
  });
}

/** Patch a draft cell's settings/frames. `endAssetId` null clears the end frame. */
export async function updateCell(
  actor: CurrentUser,
  jobId: string,
  patch: { prompt?: string; modelName?: string; mode?: "std" | "pro"; duration?: "5" | "10"; endAssetId?: string | null },
) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  const params = { ...(job.params as CellParams) };
  if (patch.prompt !== undefined) params.prompt = patch.prompt;
  if (patch.modelName !== undefined) params.modelName = patch.modelName;
  if (patch.mode !== undefined) params.mode = patch.mode;
  if (patch.duration !== undefined) params.duration = patch.duration;
  if (patch.endAssetId !== undefined) {
    params.endPath = patch.endAssetId ? (await assetPath(patch.endAssetId)) ?? undefined : undefined;
  }
  return db.job.update({ where: { id: jobId }, data: { params: params as object } });
}

export async function deleteCell(actor: CurrentUser, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  await assertCanEdit(actor, job.projectId);
  await db.job.delete({ where: { id: jobId } });
}

/** Variant: clone a cell (same frames+settings) as a new draft right after it. */
export async function duplicateCell(actor: CurrentUser, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  return db.job.create({
    data: {
      projectId: job.projectId, createdById: actor.id, type: job.type,
      status: "draft", params: job.params as object, batchId: job.batchId ?? undefined,
    },
  });
}

/** Generate: move a draft cell into the queue (worker picks it up). */
export async function generateCell(actor: CurrentUser, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Cell không tồn tại");
  await assertCanEdit(actor, job.projectId);
  if (job.status !== "draft" && job.status !== "succeeded" && job.status !== "failed") return job;
  return db.job.update({
    where: { id: jobId },
    data: { status: "queued", error: null, resultUrl: null, klingAccountId: null, klingTaskId: null },
  });
}
```

- [ ] **Step 2:** `npm run build` → clean (validates the `Job.params` JSON cast + Prisma usage). `npm test` → pass.
- [ ] **Step 3:** Commit:
```bash
git add src/lib/cells.ts
git commit -m "feat(cells): draft-job cell service (create/update/delete/duplicate/generate/list)"
```

---

## Task 5: Worker — resolve image paths → base64 at submit

**Files:** Modify `src/worker/dispatcher.ts`.

- [ ] **Step 1:** In `src/worker/dispatcher.ts`, add an import:
```ts
import { fileToBase64 } from "@/lib/uploads";
```

- [ ] **Step 2:** Replace the submit block (the `try { const task = job.type === "image2video" ? … : … }`) so it builds Kling params from the stored cell shape. Replace:
```ts
  try {
    const task =
      job.type === "image2video"
        ? await client.createImage2Video(job.params as unknown as Image2VideoParams)
        : await client.createLipSync(job.params as unknown as LipSyncParams);
    await attachAccountAndTask(jobId, account.id, task.taskId);
    return true;
```
with:
```ts
  try {
    let task;
    if (job.type === "image2video") {
      const p = job.params as {
        imagePath: string; endPath?: string; prompt?: string;
        modelName?: string; mode?: "std" | "pro"; duration?: "5" | "10";
      };
      const params: Image2VideoParams = {
        image: await fileToBase64(p.imagePath),
        imageTail: p.endPath ? await fileToBase64(p.endPath) : undefined,
        prompt: p.prompt,
        modelName: p.modelName,
        mode: p.mode,
        duration: p.duration,
      };
      task = await client.createImage2Video(params);
    } else {
      task = await client.createLipSync(job.params as unknown as LipSyncParams);
    }
    await attachAccountAndTask(jobId, account.id, task.taskId);
    return true;
```
(The `Image2VideoParams` import already exists at the top of the file.)

- [ ] **Step 3:** `npm run build` → clean. `npm test` → pass. Boot check: `(npm run worker > /tmp/kdf-m6.log 2>&1 &) ; sleep 5 ; pkill -f "src/worker/index.ts" ; cat /tmp/kdf-m6.log` → starts cleanly, idles (no accounts).
- [ ] **Step 4:** Commit:
```bash
git add src/worker/dispatcher.ts
git commit -m "feat(worker): read stored image path(s) -> base64 before submitting to Kling"
```

---

## Done criteria for Milestone 6a

- `Asset` table + `draft` job status exist (migration committed).
- Images upload to disk under `UPLOAD_DIR`; `job.params` stores the **path**, not base64; `/uploads` is gitignored.
- `assets.ts` (createAsset/listAssets) and `cells.ts` (create/update/delete/duplicate/generate/list) are access-gated through `getProjectForUser` + `canCreateProject`.
- The worker reads the stored file(s) → base64 only at submit time.
- `npm test`, `npm run build`, `npx tsc --noEmit` clean; worker boots.

This gives M6b (the React canvas UI) a clean server contract: upload → asset; drag asset → `createCell` (draft); edit → `updateCell`; ＋variant → `duplicateCell`; Generate → `generateCell` (→ queue → worker → `resultUrl`); the page reads `listCells` + assets and auto-refreshes.
