# KlingDom Forge — Design Spec

**Date:** 2026-06-20
**Status:** Approved (design phase) → ready for implementation planning
**Sibling app:** EngZone (shares design language)

---

## 1. Purpose

An internal AI video-generation studio for a ~20-person team. Users load images
in bulk and fan them out into **Kling Image→Video** jobs (plus **Lip-sync**). All
generation flows through **one shared company Kling key** via a fair central queue,
organized into **workspaces → projects**. The UI mirrors EngZone's dark
frosted-glass aesthetic so it reads as a sibling product.

### Scale & constraints
- ~20 users, hundreds of clips/day.
- **Multiple shared company Kling accounts** (KlingAccount #1, #2, …), each with
  its own key + concurrency ceiling. Total throughput = pooled across accounts.
  The central queue distributes jobs across accounts and is the core of the product.
- **Local-first now, single VPS later.** Designed as one repo that runs on a dev
  machine today and lifts to a VPS by changing env vars only.

### v1 scope
- **In:** Image→Video, Lip-sync, batch composer (4 input modes), central queue
  **across multiple Kling accounts**, workspaces/projects, accounts + 3-tier roles,
  on-demand result download.
- **Out (deliberate, extensible later):** Text→Video, Kling image generation
  (Kolors), video extend, effects. The job model is generic (`type` field) so
  adding Text→Video later is a new job type, not a rewrite.

---

## 2. Architecture

One repo, one Postgres DB, **two processes** sharing it:

```
Next.js 14 (App Router)        ← UI + API routes (auth, enqueue jobs, read status)
        │   Postgres (Prisma)
worker.js (always-on loop)     ← claims jobs, signs Kling JWT, submits, polls status
        │
   Kling API  (shared company key)
```

- **Why two processes:** serverless functions can't poll Kling for minutes per
  clip. The worker is a plain long-running Node script. Dev: run both with one
  command (e.g. `concurrently`). VPS: `systemd` or `pm2`. Only env vars change.
- **Why Postgres (not SQLite):** the worker dequeues with
  `SELECT … FOR UPDATE SKIP LOCKED` for safe concurrent job-claiming. Runs locally
  (Docker or local install) and identically on the VPS.
- **ORM:** Prisma (type-safe, easy migrations).

### Hosting path
- **Now:** local machine — Next.js dev server + worker + local Postgres.
- **Later:** single VPS — same two processes under a process manager, behind a
  reverse proxy, with a managed/local Postgres. No code changes.

---

## 3. The queue (heart of the system)

- **Global FIFO**, with a **max-in-flight cap per user and per workspace**
  (Super-Admin-configurable) so no one can flood the shared pool.
- **Multiple Kling accounts**, each with its own `maxConcurrent`. The effective
  pool concurrency = sum of `maxConcurrent` across enabled accounts.
- **Worker = two loops:**
  - *Dispatcher* — claim queued jobs that don't breach per-user/per-workspace caps,
    then **pick a Kling account with free capacity** (least-loaded, else
    round-robin among enabled accounts). Submit to that account → mark `submitted`,
    storing both `klingTaskId` and `klingAccountId`.
  - *Poller* — check `submitted`/`processing` jobs using **the same account** that
    owns each task → on `succeed` store result URL + estimated expiry; on `failed`
    capture error. Retry with backoff on transient failures.
- **Failover:** repeated auth/credit errors on an account auto-disable it; its
  in-flight jobs are re-queued and the dispatcher routes around it.
- **Job lifecycle:** `queued → submitted → processing → succeeded | failed`.

### Kling integration notes
- **Auth (per account):** each account's Access Key + Secret Key → HS256 JWT
  (short expiry, e.g. 30 min), sent as `Bearer`. Signed in `lib/kling.ts` per
  account, regenerated as needed.
- **Image→Video:** images sent to Kling as base64 (no public image hosting
  required).
- **Lip-sync:** chains off a finished clip (by task/result) or an uploaded
  video + audio/text.
- **Async model:** create task → `task_id` → poll until
  `submitted → processing → succeed/failed` → result URL.

---

## 4. Data model (sketch)

- `users` — id, email, name, image, role (`super_admin` | `manager` | `member`),
  createdAt. (No password — authenticated via Google Workspace SSO.)
- `workspaces` — id, name, maxInFlight, dailyQuota (nullable), createdBy.
- `workspace_members` — workspaceId, userId, role (`manager` | `member`).
- `projects` — id, workspaceId, name, createdBy.
- `batches` — id, projectId, userId, name, source
  (`folder` | `csv` | `manual` | `variations`), total, createdAt.
- `jobs` — id, projectId, batchId, userId, type (`image2video` | `lipsync`),
  status, params (JSON), **klingAccountId**, klingTaskId, resultUrl,
  resultExpiresAt, error, createdAt, updatedAt.
- `kling_accounts` — id, label (`KlingAccount #1`, …), accessKey, secretKey,
  maxConcurrent, enabled, notes, createdAt. (Secrets stored encrypted at rest.)
- `settings` — default caps, default global concurrency, etc. (single-row or
  key/value).

Usage/analytics derived from `jobs`.

---

## 5. Batch composer (4 inputs → one job list)

A single "New batch" screen with 4 tabs, all converging on the same reviewable
**job tray** before submit:

1. **Drag a folder of images** → one job per image, shared prompt + settings.
2. **CSV / spreadsheet** → per-row image reference + prompt + duration/settings.
3. **One-by-one builder** → add and tweak jobs individually.
4. **Prompt variations** → one image × N prompts/seeds → fan out.

The tray shows every resolved job, lets the user edit/remove before committing,
then enqueues the whole batch atomically.

---

## 6. Results & storage

- Store **metadata + Kling result URL only** (no automatic file archive).
- **Download on demand**, with a clear expiry warning (~30-day Kling link life).
- Optional **"save to disk"** per clip/project for keepers (behind a thin storage
  helper, so swapping to S3/R2 on the VPS later is a config change).
- **Project gallery** with status badges and live polling of job status.

---

## 7. Auth & roles

- **Auth:** Google Workspace SSO (Sign in with Google) via Auth.js (NextAuth) with
  the Google provider and a JWT cookie session (no DB session table). No passwords.
  - **Domain restriction:** the sign-in callback rejects any email outside the
    allowed Google Workspace domain (`crossian.com`, configurable via env). Any
    other Google account is denied.
  - **Super Admin bootstrap:** an env allowlist of emails
    (`SUPER_ADMIN_EMAILS`, default `hoang.vietnguyen@crossian.com`) gets the
    `super_admin` role on first login; everyone else defaults to `member`.
  - **Prerequisite:** a Google Cloud OAuth 2.0 Client (Web) with redirect URI
    `http://localhost:3000/api/auth/callback/google` (and the VPS URL later);
    `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `AUTH_SECRET` / `AUTH_URL` in env.
- **Three tiers:**
  - **Super Admin** (1–2 people) — manages the **Kling accounts** (add/edit/
    enable-disable keys, set each account's `maxConcurrent`), sees the global queue
    and all usage + per-account load, manages users, sets caps/quotas. Only role
    touching billing/keys.
  - **Workspace Manager** (one per workspace) — creates projects, adds/removes
    members in their workspace, sees workspace usage. Can't see other workspaces or
    the key.
  - **Member** — works only in assigned workspaces: submits generations, views and
    downloads clips. (Project creation: allowed for members by default; revisit if
    too loose.)
- **Access boundary:** workspace membership — you only see workspaces you belong to.

---

## 8. Look & feel

- Next.js 14 App Router + Tailwind 3.
- Dark background `#0b0d12`, surface `#14171f`, purple accent `#7c5cff`
  (hover `#6b4af0`, soft `#a78bfa`), success `#34d399`, error `#f87171`.
- Frosted-glass cards (`backdrop-filter: blur + saturate` over gradient overlay),
  consistent `rounded-xl`, system font stack — lifted from EngZone's tokens.
- Real-time job status via client polling (upgrade to SSE later if needed).

---

## 9. Open items / future

- Tune each account's `maxConcurrent` and per-user/workspace caps once the real
  Kling plan limits are known.
- Confirm exact Kling endpoint paths + Lip-sync request shape during
  implementation (official dev docs).
- Future: Text→Video job type, S3/R2 storage backend.
