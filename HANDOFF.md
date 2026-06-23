# KlingDom Forge — Handoff (2026-06-23)

> Tiếp nối handoff 2026-06-22. Đã merge nhánh `ĐA` vào `main` + làm **Object storage R2 phần 1–2**.
> Việc tiếp theo: **R2 phần 4** (dispatcher — mở khoá Motion Control) rồi **phần 5** (GC).

---

## 0. Bối cảnh
- Internal Kling AI batch video studio, ~20 user dùng chung, shared key + central FIFO queue.
- Stack: Next.js 14 (App Router) + Prisma/Postgres + worker daemon (`tsx src/worker`) + NextAuth v5 (Google, gate `@crossian.com`).
- Chạy local: `npm run dev:all` (web :3000 + worker). Postgres localhost:5432/klingdom_forge.
- Migrations đã apply tới: `storage_key_rename`. Prisma client đã generate.
- Spec R2: `docs/superpowers/specs/2026-06-23-r2-object-storage-design.md`.

---

## 1. Đã xong phiên này
- **Merge nhánh `ĐA`** vào `main` (studio: output preview, drag-reorder, multi-select, in-site dialogs; fix cảnh báo Kling-key khi gán shared account).
- **R2 phần 1** — `src/lib/storage.ts`: `StorageProvider` (S3 API qua `@aws-sdk/client-s3`) với `put/read/publicUrl/delete`. Fail-fast nếu thiếu `S3_*`. Test mock 9/9 pass (`tests/storage.test.ts`).
- **R2 phần 2** — chuyển storage disk→R2:
  - Migration `storage_key_rename`: `Asset.storedPath` & `LibraryVideo.storedPath` → `storageKey` (RENAME COLUMN tại chỗ; **forward-only** — file local cũ không migrate).
  - `uploads.ts` key helpers (`assetKey/thumbKey/libraryKey`); `saveUpload`→`storage.put`; `fileToBase64`/`deleteUpload` theo key.
  - `assets.ts`, `library-videos.ts`, serve routes (`/api/assets/[id]`, `/api/library/[id]`), `cells.ts`, `trimVideoAction` (ffmpeg đọc public URL R2).
  - tsc sạch; full suite 86/87 (1 fail có sẵn từ trước: `tests/access.test.ts` — "plain member cannot delete projects", KHÔNG do R2).

---

## 2. 🔴 ƯU TIÊN tiếp theo: R2 phần 4 — dispatcher (mở khoá Motion Control)
File: `src/worker/dispatcher.ts` (hàm `buildTask`).
- **Motion Control** (dòng ~63–64): đang gửi `fileToBase64(p.imagePath)`/`fileToBase64(p.videoPath)` vào `imageUrl`/`videoUrl` → **sai** (Kling cần URL công khai). Đổi sang `getStorage().publicUrl(p.imagePath)` + `getStorage().publicUrl(p.videoPath)`.
- **Image→Video / Avatar**: GIỮ base64, nhưng `fileToBase64` giờ đã đọc từ R2 theo key (xong ở phần 2) — không cần đổi gì thêm; chỉ xác nhận `p.imagePath` v.v. là storage key (đúng, vì `assetPath()` trả key).
- `p.videoPath` cho motion có thể là asset key hoặc library key — cả hai đều là key R2 hợp lệ cho `publicUrl()`.

## 3. R2 phần 5 — GC (vá bug file mồ côi)
- Xoá project/batch/cell hiện KHÔNG dọn object. Thu thập storageKey asset liên quan rồi `getStorage().delete(keys)` trong `src/lib/projects.ts` / `cells.ts` / `batches.ts`.
- `deleteAsset` đã xoá `[storageKey, thumbKey]` (xong phần 2).

## 4. Hoãn (tuỳ chọn)
- **Thumbnail webp** (`sharp` đã cài): sinh khi upload ảnh trong `createAsset` → `thumbs/...`; thêm route/UI dùng `publicUrl(thumbKey)` cho gallery nhẹ.
- **Perf Studio**: render lại toàn bộ ô mỗi state đổi → `React.memo`+`useCallback` cho Cell, polling status riêng thay `router.refresh()` 4s.

---

## 5. ⚙️ Thiết lập R2 (BẮT BUỘC để chạy — R2-only, không fallback)
Không có 5 biến `S3_*` thì app throw ngay khi đụng storage (upload/serve/dispatch).

**Tạo trên Cloudflare:**
1. Đăng nhập Cloudflare → **R2** (cần bật, có free tier; thêm thẻ nhưng egress free).
2. **Create bucket** → đặt tên, vd `klingdom`. → `S3_BUCKET=klingdom`.
3. Trang R2 hiển thị **S3 API endpoint** dạng `https://<account_id>.r2.cloudflarestorage.com` → `S3_ENDPOINT`.
4. **Manage R2 API Tokens** → Create token → quyền **Object Read & Write**, scope tới bucket trên.
   - Copy **Access Key ID** → `S3_ACCESS_KEY`; **Secret Access Key** (hiện 1 lần) → `S3_SECRET_KEY`.
5. Bucket → **Settings → Public access** → bật **R2.dev subdomain** (hoặc gắn custom domain).
   - Lấy URL `https://pub-xxxx.r2.dev` → `S3_PUBLIC_URL`.
   - ⚠️ Public access là cần thiết: Kling phải fetch ảnh/video motion từ URL này.

**Điền vào `.env`** (xem mẫu + chú thích trong `.env.example`):
```
S3_ENDPOINT="https://<account_id>.r2.cloudflarestorage.com"
S3_BUCKET="klingdom"
S3_ACCESS_KEY="..."
S3_SECRET_KEY="..."
S3_PUBLIC_URL="https://pub-xxxx.r2.dev"
```
**Kiểm tra:** `npm run dev:all` → upload 1 ảnh trong Studio → ảnh hiện (serve qua R2). Mở `S3_PUBLIC_URL/<key>` trên trình duyệt ẩn danh phải tải được (không cần login) → Kling sẽ fetch được.

---

## 6. 🚀 Deploy (để cả nhóm dùng)
Hai chặng — tunnel tạm trước, server công ty sau. Vì R2 từ xa ngay từ đầu nên đổi server KHÔNG cần migrate ảnh.

**A. Tạm (1 máy luôn bật, demo nhóm):**
- `npm run dev:all` trên 1 máy (web :3000 + worker).
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:3000` → cấp domain `https://*.trycloudflare.com`.
- Set `AUTH_URL="https://<tunnel-domain>"`; thêm domain đó vào **Authorized redirect URIs** trong Google Cloud Console (OAuth client) — nếu không sẽ lỗi `redirect_uri_mismatch`.

**B. Server công ty (ổn định):**
1. **Postgres managed** (Supabase/Neon) thay localhost → set `DATABASE_URL`; chạy `npx prisma migrate deploy`.
2. Build & chạy: `npm run build && npm start` (web) + `npm run worker` (daemon) — cần 2 process (vd PM2/systemd, hoặc 2 service).
3. Đặt **secrets** trên server (đừng commit): `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `KLING_ENC_KEY`, 5 biến `S3_*`, `DATABASE_URL`, `AUTH_URL=https://<domain công ty>`.
4. Google Cloud Console → thêm redirect URI domain công ty.
5. Reverse proxy (Nginx/Caddy) → HTTPS → :3000.
- Lưu ý: ảnh/video đã ở R2 nên rời localhost không mất dữ liệu; chỉ cần Postgres mang theo (managed).

---

## 7. Ghi chú môi trường
- Nếu :3000/:3001 lạ (500 stale do nhiều dev server orphan): `pkill -f "next dev"; pkill -f "tsx watch src/worker"; pkill -f concurrently` rồi start 1 cái.
- Key ElevenLabs/Kling/R2 nhập trong app hoặc `.env` (gitignored) — không commit.
