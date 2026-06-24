# R2 Object Storage — Design Spec

**Date:** 2026-06-23
**Status:** Approved (brainstorming) — ready for implementation plan
**Branch context:** `main @ post-merge of ĐA` (local, not yet pushed)

## Problem

Kling's Motion Control endpoint (`POST /v1/videos/motion-control`) requires the `image_url`
and `video_url` fields to be **publicly reachable URLs** — Kling's servers fetch them directly.
It does **not** accept base64 (unlike Image→Video, whose `image` field takes base64 and works
today). The motion reference video can be up to 100 MB, so base64 (~+33% overhead) is not viable
regardless.

Current storage keeps assets on local disk (`uploads/<projectId>/<assetId>.ext` via
`src/lib/uploads.ts`), served through `/api/assets/[id]` behind a session check — i.e. on
`localhost`, which Kling cannot reach. So Motion Control currently fails: `src/worker/dispatcher.ts`
(lines 63–64) sends `fileToBase64(...)` into `imageUrl`/`videoUrl`.

## Goal

Move source images + motion reference videos + thumbnails to **Cloudflare R2** (S3-compatible,
egress-free object storage) so they have stable public URLs Kling can fetch. This unlocks Motion
Control. It also fixes a latent orphan-file bug (deleting projects/batches/cells does not clean up
stored files today).

## Decisions (locked)

- **Storage backend:** Cloudflare R2 via the S3 API. **R2-only** — no local-disk fallback. The
  app fails fast at storage init if the `S3_*` env vars are missing.
- **Library videos:** `LibraryVideo` (motion reference videos) also move to R2 — they need public
  URLs for Motion Control too.
- **Existing local assets:** **Forward-only**. New uploads go to R2; pre-existing `uploads/` files
  are not migrated (dev-only data, app not yet deployed).
- **Kling output videos:** stay on Kling's CDN (downloaded locally → Drive). Not stored in R2.
  Kling output URLs expire in ~weeks → download promptly. (Unchanged from today.)

## Why R2 / why the `S3_*` naming

R2 speaks the Amazon S3 API, so we use the standard `@aws-sdk/client-s3` client. The env vars are
named `S3_*` because they describe an S3-protocol endpoint — the values point at R2, and the same
code would work against AWS S3 or any S3-compatible store without changes. R2 is chosen over AWS S3
because it has **no egress fees** (Kling pulling a 100 MB video out of the bucket is free).

## Architecture

### 1. StorageProvider (`src/lib/storage.ts`) — new

A thin S3 wrapper, single module, one clear purpose: turn `(key, bytes)` into stored objects and
keys into URLs/bytes.

Interface:

| Method | Signature | Use |
|--------|-----------|-----|
| `put` | `put(key: string, bytes: Buffer, contentType?: string): Promise<void>` | Write/overwrite an object |
| `read` | `read(key: string): Promise<Buffer>` | Fetch bytes (serve route, base64 dispatch) |
| `publicUrl` | `publicUrl(key: string): string` | Build `${S3_PUBLIC_URL}/${key}` (Motion Control) |
| `delete` | `delete(keys: string[]): Promise<void>` | Bulk-delete on GC; tolerates missing keys |

Implementation:
- Uses `@aws-sdk/client-s3` (`S3Client`, `PutObjectCommand`, `GetObjectCommand`,
  `DeleteObjectsCommand`). `@aws-sdk/s3-request-presigner` is included for future signed-URL needs
  but `publicUrl` uses the bucket's public domain (`S3_PUBLIC_URL`) directly.
- Reads 5 env vars at module init. **Any missing → throw** (fail-fast, no silent fallback).
- `delete([])` is a no-op; deleting a non-existent key is not an error.

Env vars (added to `.env.example` with comments on where to get each from Cloudflare):

| Var | Meaning |
|-----|---------|
| `S3_ENDPOINT` | R2 account endpoint, `https://<account_id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY` | R2 API token access key id |
| `S3_SECRET_KEY` | R2 API token secret |
| `S3_PUBLIC_URL` | Public base URL of the bucket (`https://pub-xxx.r2.dev` or custom domain) |

### 2. Key scheme

- Asset: `assets/<projectId>/<assetId><ext>`
- Asset thumbnail: `thumbs/<projectId>/<assetId>.webp`
- Library video: `library/<libraryVideoId><ext>`

Keys are app-generated (cuid-based), so they cannot escape the bucket prefix regardless of the
original filename — same safety property as today's `assetStoredPath`.

### 3. Schema changes (Prisma migration)

- `Asset.storedPath` → `storageKey` (relative R2 key).
- `LibraryVideo.storedPath` → `storageKey`.
- Job `params` JSON: the embedded `imagePath` / `endPath` / `videoPath` / `avatarAudioPath` fields
  now hold storage keys (the value returned by `assetPath()`), not absolute filesystem paths.
  No schema change (params is JSON) — only the meaning of the stored string changes.

Because existing local assets are forward-only, the migration renames the column; old rows keep
their now-stale value but are not expected to resolve. (Dev data; acceptable.)

### 4. Upload path

- `src/lib/uploads.ts`: replace `saveUpload`'s `writeFile` with `storage.put(key, bytes, mime)`;
  return the **key** instead of an absolute path. `fileToBase64(path)` → a helper that reads by key
  (`storage.read(key)`) and base64-encodes. `deleteUpload(path)` → key-based delete.
- `src/lib/assets.ts`: `createAsset` stores `storageKey`; generates a webp thumbnail via `sharp`
  for image assets and `put`s it at the thumb key. `deleteAsset` collects `[storageKey, thumbKey]`
  and calls `storage.delete(...)`.
- `src/lib/library-videos.ts`: same treatment — `put` to R2, store `storageKey`, delete by key.

### 5. Serve routes

- `src/app/api/assets/[id]/route.ts` and `src/app/api/library/[id]/route.ts`: keep the existing
  session auth boundary; replace `readFile(storedPath)` with `storage.read(storageKey)`.

### 6. Dispatcher (`src/worker/dispatcher.ts`)

- **Motion Control:** `imageUrl = storage.publicUrl(p.imagePath)`,
  `videoUrl = storage.publicUrl(p.videoPath)` — replaces the `fileToBase64(...)` calls. **Fixes the
  bug.**
- **Image→Video / Avatar:** still base64, but read from R2 — `await fileToBase64FromKey(p.imagePath)`
  (read via `storage.read`, then base64). Behavior unchanged from Kling's perspective.

### 7. Garbage collection (orphan-file fix)

Deleting a project / batch / cell / asset must bulk-delete the associated R2 objects.

- `deleteAsset` (already exists): delete `[storageKey, thumbKey]`.
- `src/lib/projects.ts`, `src/lib/cells.ts`, `src/lib/batches.ts`: before/after the DB cascade,
  collect the storage keys of affected assets (and thumbs) and call `storage.delete(keys)`.
  These paths currently do **not** clean up stored files — this both adds R2 cleanup and fixes the
  pre-existing orphan bug.

## Data flow (Motion Control, after change)

1. User uploads image + reference video → `createAsset` → `storage.put` → DB row with `storageKey`.
2. Cell created → `params.imagePath`/`params.videoPath` = the assets' storage keys.
3. Worker dispatches → `storage.publicUrl(key)` → `image_url`/`video_url` in the Kling request.
4. Kling fetches both from the R2 public domain → job runs.

## Error handling

- Storage init: missing `S3_*` → throw with a clear message naming the missing var(s).
- `put`/`read`/`delete` failures surface as thrown errors; upload routes return 5xx, dispatcher
  treats a dispatch-build failure via its existing retry/requeue classification.
- `delete` is best-effort per key: a missing object does not fail the batch.

## Testing

- Unit-test `StorageProvider` against a **mocked S3 client** (no live R2 needed): `put` issues the
  right command/key, `publicUrl` composes the URL correctly, `delete([])` is a no-op, missing env
  throws at init.
- Unit-test key-scheme helpers (path traversal safety, ext handling) — extend existing
  `uploads`-style tests.
- Live R2 verification (upload → public URL reachable → Kling Motion Control succeeds) requires the
  user's R2 credentials and is done after env setup, outside CI.

## Out of scope (this round)

- Migrating existing local `uploads/` to R2 (forward-only).
- Storing Kling output videos in R2.
- Studio render performance work.
- Deploy / Cloudflare Tunnel / managed Postgres.

## Prerequisite (user action)

Create a Cloudflare account + R2 bucket + API token, then fill the 5 `S3_*` vars in `.env`.
Claude does not enter credentials. The mock-tested code can be written before this; live testing
and Motion Control verification require it.
