# KlingDom Forge — Milestone 5: Batch Composer UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The first user-facing generation flow: open a project, compose an Image→Video batch (upload N images + shared prompt/settings), submit it into the queue, and watch jobs progress with status badges and result video links.

**Architecture:** A project detail page (Server Component) lists the project's jobs with live auto-refresh. A client `BatchComposer` reads selected images into base64 and calls a Server Action that builds one job per image and `enqueueJobs(... "image2video" ...)`. The worker (M4) then processes them. Reuses M4's queue + M3's client.

**Tech Stack:** Next.js 14 App Router (Server Components, Server Actions, one Client Component for file reading + auto-refresh), Prisma, the M4 `queue` service.

**Spec:** `docs/superpowers/specs/2026-06-20-klingdom-forge-design.md` (§5 batch composer, §6 results).

**Builds on:** M1–M4 (on `main`). Reuses `requireUser`, `getWorkspaceForUser`, `enqueueJobs`, `canCreateProject`, access predicates, UI kit (`Card`/`PageHeader`/`Button`/`TextInput`/`Select`).

**Scope note:** v1 of the composer covers **Image→Video** via multi-image upload + a one-shared-prompt batch. Deferred to a later milestone (M5b): the CSV and prompt-variation input modes, and the Lip-sync composer. The job/queue model already supports them.

---

## File Structure

```
src/lib/projects.ts                                           # MODIFY — add getProjectForUser()
src/lib/queue.ts                                              # MODIFY — add listJobsForProject()
src/app/workspaces/[workspaceId]/page.tsx                     # MODIFY — link project cards to project page
src/app/workspaces/[workspaceId]/projects/[projectId]/
├── page.tsx                                                  # CREATE — project detail: jobs + New batch
├── AutoRefresh.tsx                                           # CREATE — client: refresh while jobs active
├── new-batch/
│   ├── page.tsx                                              # CREATE — composer page (server shell)
│   ├── BatchComposer.tsx                                     # CREATE — client: pick images → base64 → submit
│   └── actions.ts                                            # CREATE — createImage2VideoBatchAction
next.config.mjs                                               # MODIFY — raise server action body size limit
```

---

## Task 1: Read services (project + jobs) and link project cards

**Files:** Modify `src/lib/projects.ts`, `src/lib/queue.ts`, `src/app/workspaces/[workspaceId]/page.tsx`.

- [ ] **Step 1: Add `getProjectForUser` to `src/lib/projects.ts`** (append; keep existing createProject/deleteProject):

```ts
import { canAccessWorkspace } from "@/lib/access";

/** Returns the project + its workspace if the actor may access it, else null. */
export async function getProjectForUser(actor: CurrentUser, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });
  if (!project) return null;
  const membership =
    actor.role === "super_admin"
      ? null
      : await db.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: actor.id } },
          select: { role: true },
        });
  if (!canAccessWorkspace(actor.role, membership)) return null;
  return { project, membership };
}
```

(Note: `getProjectForUser` needs `canAccessWorkspace` imported. The file already imports `canCreateProject, canDeleteProject, type Membership` from `@/lib/access` and `db`, `CurrentUser` — add `canAccessWorkspace` to that import.)

- [ ] **Step 2: Add `listJobsForProject` to `src/lib/queue.ts`** (append):

```ts
/** All jobs in a project, newest first (for the project detail view). */
export async function listJobsForProject(projectId: string): Promise<Job[]> {
  return db.job.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
}
```

- [ ] **Step 3: Link project cards in `src/app/workspaces/[workspaceId]/page.tsx`.**
Find where projects are rendered (`workspace.projects.map((p) => ( <Card …><span>{p.name}</span>…`). Wrap the project name in a link to the project page. Replace the project name span with:

```tsx
                <Link
                  href={`/workspaces/${workspace.id}/projects/${p.id}`}
                  className="text-white hover:text-accent-soft"
                >
                  {p.name}
                </Link>
```

Add `import Link from "next/link";` at the top of that file if not already present.

- [ ] **Step 4:** `npm run build` → clean. `npm test` → 44 pass.
- [ ] **Step 5:** Commit:
```bash
git add src/lib/projects.ts src/lib/queue.ts "src/app/workspaces/[workspaceId]/page.tsx"
git commit -m "feat(projects): getProjectForUser + listJobsForProject + link project cards"
```

---

## Task 2: Project detail page + job status + auto-refresh

**Files:** Create `…/projects/[projectId]/page.tsx` and `…/projects/[projectId]/AutoRefresh.tsx`.

- [ ] **Step 1: Create the client auto-refresh helper `src/app/workspaces/[workspaceId]/projects/[projectId]/AutoRefresh.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Calls router.refresh() on an interval while there is active work to poll. */
export default function AutoRefresh({ active, ms = 4000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [active, ms, router]);
  return null;
}
```

- [ ] **Step 2: Create `src/app/workspaces/[workspaceId]/projects/[projectId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JobStatus } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { listJobsForProject } from "@/lib/queue";
import { Card, PageHeader, Button } from "@/components/ui";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<JobStatus, string> = {
  queued: "text-muted",
  submitted: "text-accent-soft",
  processing: "text-accent-soft",
  succeeded: "text-ok",
  failed: "text-bad",
};

export default async function ProjectPage({
  params,
}: {
  params: { workspaceId: string; projectId: string };
}) {
  const user = await requireUser();
  const result = await getProjectForUser(user, params.projectId);
  if (!result) notFound();
  const jobs = await listJobsForProject(params.projectId);
  const active = jobs.some((j) => j.status === "queued" || j.status === "submitted" || j.status === "processing");

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <AutoRefresh active={active} />
      <div className="flex items-start justify-between">
        <PageHeader title={result.project.name} subtitle="Project" />
        <Link href={`/workspaces/${params.workspaceId}/projects/${params.projectId}/new-batch`}>
          <Button>+ Tạo batch</Button>
        </Link>
      </div>

      <div className="mt-8 space-y-2">
        {jobs.length === 0 && (
          <Card><p className="text-muted">Chưa có job nào. Bấm “Tạo batch” để bắt đầu.</p></Card>
        )}
        {jobs.map((j) => (
          <Card key={j.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-muted">{j.type} · {j.id.slice(0, 8)}</span>
              <span className={`text-sm ${STATUS_STYLE[j.status]}`}>{j.status}</span>
            </div>
            {j.status === "succeeded" && j.resultUrl && (
              <a href={j.resultUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent-soft underline">
                Xem / tải video →
              </a>
            )}
            {j.status === "failed" && j.error && (
              <p className="mt-2 text-sm text-bad">{j.error}</p>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3:** `npm run build` → clean; route `/workspaces/[workspaceId]/projects/[projectId]` present. `npm test` → 44 pass.
- [ ] **Step 4:** Commit:
```bash
git add "src/app/workspaces/[workspaceId]/projects/[projectId]/page.tsx" "src/app/workspaces/[workspaceId]/projects/[projectId]/AutoRefresh.tsx"
git commit -m "feat(projects): project detail page with job status + auto-refresh"
```

---

## Task 3: Image→Video batch composer

**Files:** Create `…/new-batch/actions.ts`, `…/new-batch/BatchComposer.tsx`, `…/new-batch/page.tsx`; modify `next.config.mjs`.

- [ ] **Step 1: Raise the Server Action body size limit in `next.config.mjs`** (base64 images are large):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};
export default nextConfig;
```

- [ ] **Step 2: Create the server action `…/new-batch/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { enqueueJobs } from "@/lib/queue";

export type ComposerImage = { name: string; dataBase64: string };
export type ComposerSettings = {
  prompt: string;
  duration: "5" | "10";
  mode: "std" | "pro";
};

/** One image → one image2video job, all sharing the batch settings. */
export async function createImage2VideoBatchAction(
  workspaceId: string,
  projectId: string,
  settings: ComposerSettings,
  images: ComposerImage[],
) {
  const actor = await requireUser();
  if (images.length === 0) throw new Error("Chọn ít nhất 1 ảnh");
  const paramsList = images.map((img) => ({
    image: img.dataBase64,
    prompt: settings.prompt || undefined,
    duration: settings.duration,
    mode: settings.mode,
  }));
  await enqueueJobs(actor, projectId, "image2video", "folder", paramsList);
  redirect(`/workspaces/${workspaceId}/projects/${projectId}`);
}
```

- [ ] **Step 3: Create the client composer `…/new-batch/BatchComposer.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card, Button, TextInput, Select } from "@/components/ui";
import {
  createImage2VideoBatchAction,
  type ComposerImage,
  type ComposerSettings,
} from "./actions";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // strip the "data:image/...;base64," prefix — Kling wants raw base64
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function BatchComposer({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<"5" | "10">("5");
  const [mode, setMode] = useState<"std" | "pro">("std");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    if (files.length === 0) {
      setError("Chọn ít nhất 1 ảnh");
      return;
    }
    startTransition(async () => {
      try {
        const images: ComposerImage[] = await Promise.all(
          files.map(async (f) => ({ name: f.name, dataBase64: await readAsBase64(f) })),
        );
        const settings: ComposerSettings = { prompt, duration, mode };
        await createImage2VideoBatchAction(workspaceId, projectId, settings, images);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gửi batch thất bại");
      }
    });
  }

  return (
    <Card className="mt-8">
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-sm text-muted">Ảnh (chọn nhiều)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-accent file:px-3 file:py-2 file:text-white"
          />
          {files.length > 0 && (
            <p className="mt-1 text-sm text-muted">{files.length} ảnh → {files.length} job</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-muted">Prompt (dùng chung cho cả batch)</label>
          <TextInput value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="vd: camera quay chậm, điện ảnh" className="w-full" />
        </div>

        <div className="flex gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Thời lượng</label>
            <Select value={duration} onChange={(e) => setDuration(e.target.value as "5" | "10")}>
              <option value="5">5s</option>
              <option value="10">10s</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Chế độ</label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as "std" | "pro")}>
              <option value="std">std</option>
              <option value="pro">pro</option>
            </Select>
          </div>
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}

        <div>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? "Đang gửi…" : `Tạo ${files.length || ""} job`}
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Create the composer page shell `…/new-batch/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { canCreateProject } from "@/lib/access";
import { PageHeader } from "@/components/ui";
import BatchComposer from "./BatchComposer";

export const dynamic = "force-dynamic";

export default async function NewBatchPage({
  params,
}: {
  params: { workspaceId: string; projectId: string };
}) {
  const user = await requireUser();
  const result = await getProjectForUser(user, params.projectId);
  if (!result) notFound();
  if (!canCreateProject(user.role, result.membership)) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader title="Batch mới · Image → Video" subtitle={result.project.name} />
      <BatchComposer workspaceId={params.workspaceId} projectId={params.projectId} />
    </main>
  );
}
```

- [ ] **Step 5: Verify build + tests + runtime smoke.**
`npm test` → 44 pass. `npm run build` → clean; routes `…/new-batch` and `…/projects/[projectId]` present. `npx tsc --noEmit` → exit 0.
Runtime smoke (no creds needed): start dev on a free port (`PORT=3500 npm run dev`), `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3500/workspaces/x/projects/y/new-batch` → expect 307/302 (redirect to /login). Check log clean. Kill server, free the port (don't touch 3000).

- [ ] **Step 6:** Commit:
```bash
git add next.config.mjs "src/app/workspaces/[workspaceId]/projects/[projectId]/new-batch"
git commit -m "feat(composer): Image→Video batch composer (upload images → enqueue jobs)"
```

---

## Done criteria for Milestone 5

- A project has a detail page listing its jobs with status badges; the page auto-refreshes while any job is active; succeeded jobs show a video link, failed jobs show the error.
- The "Tạo batch" composer lets a member upload N images + a shared prompt/duration/mode and submit, creating N queued image2video jobs via `enqueueJobs`.
- Access-gated: only users who can access the project see it; only those who can create projects can compose.
- `npm test`, `npm run build`, `npx tsc --noEmit` clean.

### Full end-to-end test (manual, after merge — requires a real Kling key)
1. As super_admin, add a Kling account at `/admin/kling-accounts` (enter your real ak/sk).
2. Start the worker: `npm run worker` (separate terminal).
3. Create a workspace + project; open the project → “Tạo batch” → upload a few images + a prompt → submit.
4. Watch the project page: jobs go `queued → submitted → processing → succeeded`, then a video link appears. (Lip-sync + CSV/variations are M5b.)
