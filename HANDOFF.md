# KlingDom Forge — Handoff (2026-06-22)

> Tiếp tục ở session mới. **Bản `v0.1.0` đã commit + push + tag** (`main @ 456d61a`).
> Việc tiếp theo đã chốt: **Object storage R2** (mở khoá Motion Control). Bắt đầu ở mục 2.

---

## 0. Bối cảnh
- Internal Kling AI batch video studio, ~20 user dùng chung, shared key + central FIFO queue.
- Stack: Next.js 14 (App Router) + Prisma/Postgres + worker daemon (`tsx src/worker`) + NextAuth v5 (Google, gate `@crossian.com`).
- Chạy local: `npm run dev:all` (web :3000 + worker). Postgres localhost:5432/klingdom_forge.
- Migrations đã apply tới: `user_last_workspace`. Prisma client đã generate.

---

## 1. Đã xong trong `v0.1.0` (5 đợt UI/feature, build sạch)
- **Theme/UI**: fonts Geist (body) + Space Grotesk (heading) + JetBrains Mono (mono); `AppHeader` + `UserMenu` dùng chung mọi page; Dashboard/Workspaces/Login redesign; `<select>` polish toàn cục.
- **Settings hợp nhất**: 1 panel mở qua avatar (portal ra `document.body` để không bị `backdrop-filter` của header giam `position:fixed`). Modules: **Role, Key, Workspace, Motion Library, Giao diện/theme**. Mở qua query `?settings=<module>&ws=<id>`.
  - Đã **xóa** `/admin/kling-accounts`, `/admin/library`, và trang `/workspaces/[id]` (giờ `redirect` vào panel).
  - **Workspace module**: dropdown chọn ws + "Tạo workspace" inline; Projects | divider phát sáng | Members; nút +add góc trên-phải mỗi cột.
- **Multi-key**: thêm nhiều Kling key + dropdown gán key cho từng workspace (`Workspace.klingAccountId`). Dispatcher ưu tiên: account-được-gán → `klingApiKeyEnc` (legacy) → pool chung. Có bật/tắt + xóa key.
- **Studio**: workspace switcher dropdown ở header; logo→`/`; nút Studio→workspace mở gần nhất (`User.lastWorkspaceId`); modal tạo project (bỏ `window.prompt`); xóa ảnh khỏi asset panel; gộp collapse/expand + toggle list/thumb; nút xóa ô đỏ; bỏ "+ Biến thể"; **ô = card header trên-trái (type tabs + collapse + select)**; ô collapse hiển thị tên file ảnh; checkbox select sáng rõ; **kéo-thả ảnh từ OS vào studio/ô → upload vào batch đang mở**.

> Ghi chú: còn vài state cũ không dùng trong `Studio.tsx` (chỉ warning; repo không có eslint config nên build bỏ qua lint). `dashboard.ts` vẫn trả `activity` dù dashboard đã bỏ thẻ Hoạt động gần đây.

---

## 2. 🔴 ƯU TIÊN: Object storage R2 — mở khoá Motion Control (ĐÃ CHỐT hướng #1)

**Vấn đề Motion Control (gốc):** endpoint `POST /v1/videos/motion-control` nhận field `image_url` + `video_url` là **URL công khai** (Kling tự fetch từ server họ), KHÔNG nhận base64 — khác Image→Video (field `image` nhận base64 nên đang chạy tốt). Hiện `dispatcher.ts` gửi `fileToBase64(...)` vào 2 field này → fail. Thêm nữa video motion ≤100MB nên base64 (~+33%) không khả thi.

**Hiện trạng storage:** asset lưu disk local (`uploads/<projectId>/<assetId>.ext`, `src/lib/uploads.ts` + `assets.ts`), serve qua `/api/assets/[id]` (có auth session) → localhost, Kling không với tới được.

**Giải pháp đã chốt — Cloudflare R2 (S3-compatible, egress-free):**
- Lớp `StorageProvider` viết theo **API S3** (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`). Env: `S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY / S3_PUBLIC_URL`.
  - Interface: `put(key,bytes)`, `read(key)→Buffer`, `publicUrl(key)`, `delete(keys[])`.
- Cột `Asset.storedPath` (absolute path) → đổi sang **`storageKey` tương đối**. `assetUrl()` dùng `publicUrl()`.
- **Motion Control**: tại dispatch, truyền `publicUrl(imageKey)` + `publicUrl(videoKey)` vào `image_url`/`video_url`. **Image→Video giữ base64** (đang OK, không cần đổi).
- Thumbnail webp (`sharp`) khi upload → gallery nhẹ.
- Xoá ngược + GC: xoá project/batch/cell → bulk-delete object R2 (vá luôn bug file mồ côi: `projects.ts`/`cells.ts`/`batches.ts` hiện KHÔNG dọn file). `deleteAsset` (đã có) cũng cần xoá object R2 thay vì chỉ disk.
- Video output Kling KHÔNG để R2 (tải local → Drive); R2 chỉ giữ ảnh nguồn + video motion + thumbnail. ⚠️ URL output Kling hết hạn ~vài tuần → tải sớm.

**Cần từ user:** tự tạo tài khoản Cloudflare + R2 bucket + API token (Claude không nhập credentials). Sau đó điền 5 biến `S3_*` vào `bridge/.env` (hoặc `.env`).

**Đã loại:** Google Drive làm nguồn (public link chập chờn). Tunnel + signed-public-asset là phương án tạm #2 (không chọn) — chỉ dùng nếu cần demo motion control TRƯỚC khi có R2.

---

## 3. Workstream còn lại (sau R2)
- **Perf — lag mỗi thao tác** (đã chẩn đoán, chưa sửa): `Studio.tsx` render lại toàn bộ ô mỗi state đổi. Fix: `React.memo`+`useCallback` cho Cell/MotionCell/AvatarCell → `useOptimistic` cho field → polling fetch status riêng (thay `router.refresh()` toàn trang 4s) → `Promise.all` các query trong `page.tsx`.
- **Deploy**: Cloudflare Tunnel từ 1 máy luôn bật để cả nhóm test → sau đẩy lên server công ty. Vì R2 từ xa ngay từ đầu nên dời server KHÔNG cần migrate ảnh. Cần Postgres managed (Supabase/Neon) khi rời localhost. Khi deploy: thêm redirect URI domain vào Google Cloud Console + set secrets.

---

## 4. Ghi chú môi trường (session này)
- `npm run dev:all` đang chạy nền (web :3000 + worker) — **kiểm tra trước khi start lại** (đã từng bị nhiều dev server orphan chiếm :3000/:3001 gây 500 stale; nếu lạ thì `pkill -f "next dev"; pkill -f "tsx watch src/worker"; pkill -f concurrently` rồi start 1 cái).
- Key ElevenLabs/Kling: nhập trong app, không commit. `.env` gitignored.
