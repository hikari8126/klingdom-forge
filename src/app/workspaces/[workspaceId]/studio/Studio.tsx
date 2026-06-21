"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@prisma/client";
import {
  uploadImagesAction,
  uploadVideosAction,
  createProjectAction,
  createCellAction,
  createMotionCellAction,
  updateCellAction,
  updateMotionCellAction,
  duplicateCellAction,
  deleteCellAction,
  generateCellAction,
  generateAllAction,
  swapFramesAction,
} from "./actions";

export type CellView = {
  id: string;
  status: JobStatus;
  type: string;
  resultUrl: string | null;
  error: string | null;
  startAssetId: string;
  endAssetId: string | null;
  videoAssetId: string | null;
  prompt: string;
  modelName: string;
  mode: string;
  duration: string;
  characterOrientation: "image" | "video";
  keepOriginalSound: "yes" | "no";
};

type AssetView = { id: string; filename: string; mimeType: string | null };

type Props = {
  workspaceId: string;
  workspaceName: string;
  userName: string;
  hasAccount: boolean;
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  assets: AssetView[];
  cells: CellView[];
};

const MODELS_I2V: { value: string; label: string }[] = [
  { value: "kling-v3", label: "Kling 3.0" },
  { value: "kling-v2-6", label: "Kling 2.6" },
  { value: "kling-v2-5-turbo", label: "Kling 2.5 Turbo" },
  { value: "kling-v2-1", label: "Kling 2.1" },
  { value: "kling-v1-6", label: "Kling 1.6" },
];
const MODELS_MC: { value: string; label: string }[] = [
  { value: "kling-v3", label: "Kling 3.0" },
  { value: "kling-v2-6", label: "Kling 2.6" },
];
const DURATIONS = ["3", "5", "7", "10", "15"];

const ST: Record<JobStatus, { t: string; c: string }> = {
  draft: { t: "○ Nháp — chưa gửi", c: "text-muted" },
  queued: { t: "◔ Trong hàng đợi", c: "text-muted" },
  submitted: { t: "↗ Đang gọi API Kling…", c: "text-accent-soft" },
  processing: { t: "⟳ Kling đang tạo video…", c: "text-accent-soft" },
  succeeded: { t: "✓ Hoàn tất", c: "text-ok" },
  failed: { t: "✕ Lỗi — không tạo được", c: "text-bad" },
};
const assetUrl = (id: string) => `/api/assets/${id}`;

const THEMES = [
  { id: "teal", label: "Studio Teal", color: "#2A7B9B" },
  { id: "sunset", label: "Sunset", color: "#e85a2e" },
  { id: "grape", label: "Neon Grape", color: "#8b45d4" },
  { id: "slate", label: "Mono Slate", color: "#647890" },
];

export default function Studio(props: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [imgOver, setImgOver] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState("teal");
  const [, start] = useTransition();
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("kdf-view");
      if (v === "list" || v === "grid") setView(v);
      const c = localStorage.getItem("kdf-collapsed");
      if (c) setCollapsed(JSON.parse(c));
      const t = localStorage.getItem("kdf-theme") ?? "teal";
      setActiveTheme(t);
    } catch {}
  }, []);

  function applyTheme(id: string) {
    setActiveTheme(id);
    try { localStorage.setItem("kdf-theme", id); } catch {}
    document.documentElement.dataset.theme = id === "teal" ? "" : id;
  }

  function toggleView() {
    setView((v) => {
      const n = v === "grid" ? "list" : "grid";
      try { localStorage.setItem("kdf-view", n); } catch {}
      return n;
    });
  }
  function toggleCollapse(id: string) {
    setCollapsed((m) => {
      const n = { ...m, [id]: !m[id] };
      try { localStorage.setItem("kdf-collapsed", JSON.stringify(n)); } catch {}
      return n;
    });
  }
  function collapseAll(val: boolean) {
    const n: Record<string, boolean> = {};
    props.cells.forEach((c) => (n[c.id] = val));
    setCollapsed(n);
    try { localStorage.setItem("kdf-collapsed", JSON.stringify(n)); } catch {}
  }

  const active = props.projects.find((p) => p.id === props.activeProjectId) ?? null;
  const shown = props.projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));
  const imageAssets = props.assets.filter((a) => !a.mimeType?.startsWith("video/"));
  const videoAssets = props.assets.filter((a) => a.mimeType?.startsWith("video/"));
  const activeCells = props.cells.filter(
    (c) => c.status === "queued" || c.status === "submitted" || c.status === "processing",
  );
  const anyActive = activeCells.length > 0;

  useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [anyActive, router]);

  function switchProject(id: string) {
    router.push(`/workspaces/${props.workspaceId}/studio?p=${id}`);
  }
  function newProject() {
    const name = window.prompt("Tên project mới:");
    if (!name) return;
    start(async () => {
      const id = await createProjectAction(props.workspaceId, name.trim());
      router.push(`/workspaces/${props.workspaceId}/studio?p=${id}`);
    });
  }
  function uploadImages(files: FileList | null) {
    if (!files || !files.length || !props.activeProjectId) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    start(() => uploadImagesAction(props.workspaceId, props.activeProjectId!, fd));
  }
  function uploadVideos(files: FileList | null) {
    if (!files || !files.length || !props.activeProjectId) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    start(() => uploadVideosAction(props.workspaceId, props.activeProjectId!, fd));
  }
  function handleCanvasDrop(assetId: string) {
    if (!props.activeProjectId) return;
    const asset = props.assets.find((a) => a.id === assetId);
    if (!asset) return;
    // Video dropped → motion control cell needs a paired image; for now show prompt
    // Image dropped → standard image2video cell
    if (asset.mimeType?.startsWith("video/")) {
      const imgId = imageAssets[0]?.id;
      if (!imgId) {
        alert("Hãy upload ít nhất một ảnh tham chiếu vào project trước khi tạo ô Motion Control.");
        return;
      }
      start(() => createMotionCellAction(props.workspaceId, props.activeProjectId!, imgId, assetId));
    } else {
      start(() => createCellAction(props.workspaceId, props.activeProjectId!, assetId));
    }
  }
  const updI2V = (jobId: string, patch: Parameters<typeof updateCellAction>[2]) =>
    start(() => updateCellAction(props.workspaceId, jobId, patch));
  const updMC = (jobId: string, patch: Parameters<typeof updateMotionCellAction>[2]) =>
    start(() => updateMotionCellAction(props.workspaceId, jobId, patch));

  return (
    <div className="flex h-screen flex-col">
      {/* ── HEADBAR ── */}
      <header className="flex h-[54px] flex-none items-center gap-4 border-b border-border bg-black/70 px-4 backdrop-blur-md">
        {/* brand */}
        <div className="flex items-center gap-2.5 font-semibold tracking-wide">
          <span
            className="grid h-[26px] w-[26px] flex-none place-items-center rounded-lg"
            style={{ background: "linear-gradient(135deg,rgb(var(--color-accent)),rgb(var(--color-accent-soft)))", boxShadow: "0 4px 14px -4px rgb(var(--color-accent)/0.7)" }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="#04212c"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 15l5 3-5 3z" /></svg>
          </span>
          <span className="text-sm">KlingDom Forge</span>
        </div>

        {/* workspace chip */}
        <div className="flex items-center gap-2 rounded-full border border-border px-[11px] py-[5px] text-[12.5px] text-muted">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-ok" style={{ boxShadow: "0 0 8px rgb(var(--color-ok)/0.8)" }} />
          Workspace <span className="ml-1 font-semibold text-white">{props.workspaceName}</span>
        </div>

        <div className="flex-1" />

        {/* usage pill */}
        <div className="mono flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-muted">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" /></svg>
          {props.cells.length} ô{activeCells.length > 0 && ` · ${activeCells.length} đang chạy`}
        </div>

        {/* avatar */}
        <div
          className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-[11px] font-bold text-[#06222c]"
          style={{ background: "conic-gradient(from 200deg,rgb(var(--color-accent)),rgb(var(--color-ok)),rgb(var(--color-yellow)),rgb(var(--color-accent)))" }}
        >
          {props.userName}
        </div>
      </header>

      {/* ── BODY (sidebar + canvas) ── */}
      <div className="flex min-h-0 flex-1">
        {/* SIDEBAR */}
        <aside className="flex w-[300px] flex-col border-r border-border bg-surface/40">
          <div className="border-b border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="mono text-muted">Projects</h2>
              <button onClick={() => setSettingsOpen(true)} title="Cài đặt" className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted transition hover:border-accent hover:text-accent-soft">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.8 7.8 0 000-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 00-1.7-1l-.4-2.6H9.7l-.4 2.6a7.6 7.6 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7.8 7.8 0 000 2l-2 1.5 2 3.4 2.3-1c.5.4 1.1.7 1.7 1l.4 2.6h4.6l.4-2.6c.6-.3 1.2-.6 1.7-1l2.3 1 2-3.4z" /></svg>
              </button>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm project theo tên…"
              className="w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {shown.length === 0 && <p className="p-4 text-sm text-muted">Không có project khớp.</p>}
            {shown.map((p) => {
              const on = p.id === props.activeProjectId;
              return (
                <div key={p.id} className={`mb-1 rounded-xl border ${on ? "border-accent/40 bg-accent/10" : "border-transparent"}`}>
                  <button
                    onClick={() => switchProject(p.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/5"
                  >
                    <span className="flex-1 truncate text-white">{p.name}</span>
                  </button>
                  {on && (
                    <div className="px-3 pb-3">
                      <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => { uploadImages(e.target.files); e.currentTarget.value = ""; }} />
                      <input ref={vidRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" multiple hidden onChange={(e) => { uploadVideos(e.target.files); e.currentTarget.value = ""; }} />

                      {/* image section */}
                      <div className="mb-2 flex items-center gap-2">
                        <button onClick={() => imgRef.current?.click()} className="flex-1 rounded-lg border border-dashed border-border py-2 text-xs text-muted hover:border-accent hover:text-accent-soft">
                          + Thêm ảnh
                        </button>
                        <button onClick={toggleView} title="Đổi cách xem" className="rounded-lg border border-border px-2 py-2 text-muted hover:border-accent hover:text-accent-soft">
                          {view === "grid" ? (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                          )}
                        </button>
                      </div>
                      {view === "grid" ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {imageAssets.map((a) => (
                            <img key={a.id} src={assetUrl(a.id)} alt={a.filename} title={a.filename} draggable onDragStart={(e) => e.dataTransfer.setData("text/asset", a.id)} className="aspect-[3/4] w-full cursor-grab rounded-lg border border-border object-cover transition hover:-translate-y-0.5 hover:border-accent" />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {imageAssets.map((a) => (
                            <div key={a.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/asset", a.id)} className="flex cursor-grab items-center gap-2 rounded-lg border border-border p-1.5 hover:border-accent">
                              <img src={assetUrl(a.id)} alt="" className="h-8 w-6 flex-none rounded object-cover" />
                              <span className="truncate text-xs text-white">{a.filename}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {imageAssets.length === 0 && <p className="mt-1 text-center text-[11px] text-muted">Chưa có ảnh.</p>}

                      {/* video section */}
                      <div className="mt-3 border-t border-border pt-2">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="mono text-muted">Video MC</span>
                          <button onClick={() => vidRef.current?.click()} className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent-soft">
                            + Thêm video
                          </button>
                        </div>
                        <div className="flex flex-col gap-1">
                          {videoAssets.map((a) => (
                            <div key={a.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/asset", a.id)} className="flex cursor-grab items-center gap-2 rounded-lg border border-border p-1.5 hover:border-accent-soft">
                              <span className="grid h-6 w-6 flex-none place-items-center rounded bg-white/5 text-accent-soft">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
                              </span>
                              <span className="truncate text-xs text-white">{a.filename}</span>
                            </div>
                          ))}
                          {videoAssets.length === 0 && <p className="text-center text-[11px] text-muted">Chưa có video.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-border p-3">
            <button onClick={newProject} className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/45 bg-gradient-to-b from-white/[0.05] to-transparent py-3 text-sm font-semibold text-accent-soft transition hover:border-accent hover:bg-accent/10">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
              New Project
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 px-7 py-5">
            <div>
              <div className="mono text-muted">{props.workspaceName.toUpperCase()} / {active ? active.name.toUpperCase() : "—"}</div>
              <h1 className="mt-1 text-xl font-semibold">{active ? active.name : "Chưa có project"}</h1>
            </div>
            {active && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => collapseAll(!props.cells.every((c) => collapsed[c.id]))}
                  className="rounded-full border border-border px-3 py-2 text-sm text-muted hover:border-accent hover:text-white"
                >
                  Thu/Mở tất cả
                </button>
                <button
                  onClick={() => start(() => generateAllAction(props.workspaceId, active.id))}
                  className="rounded-full bg-gradient-to-b from-[#7fe3a8] to-ok px-4 py-2 text-sm font-semibold text-[#04241a] shadow-[0_6px_20px_-6px_rgba(95,208,142,.6)] hover:brightness-110"
                >
                  ▶ Generate tất cả
                </button>
              </div>
            )}
          </div>

          <div
            onDragOver={(e) => { if (active) { e.preventDefault(); setImgOver(true); } }}
            onDragLeave={() => setImgOver(false)}
            onDrop={(e) => { setImgOver(false); const id = e.dataTransfer.getData("text/asset"); if (id) { e.preventDefault(); handleCanvasDrop(id); } }}
            className="min-h-0 flex-1 overflow-y-auto px-7 pb-10"
          >
            {!props.hasAccount && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                <span>Chưa có tài khoản Kling nào đang bật — bấm Generate sẽ <b>không gọi được API</b>. Vào <button onClick={() => router.push("/admin/kling-accounts")} className="underline">Kling Accounts</button> để thêm/bật khoá.</span>
              </div>
            )}
            {!active && <p className="text-muted">Tạo một project ở thanh bên để bắt đầu.</p>}
            {active && props.cells.length === 0 && (
              <div className={`flex h-[70%] min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center ${imgOver ? "border-accent bg-accent/10" : "border-border"}`}>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-accent-soft">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 14l4-4 5 5 3-3 6 6" /><circle cx="8.5" cy="8.5" r="1.6" /></svg>
                </div>
                <h3 className="font-semibold text-white">Vùng làm việc trống</h3>
                <p className="max-w-sm text-sm text-muted">Kéo ảnh → ô Image→Video. Kéo video → ô Motion Control.</p>
              </div>
            )}

            <div className="space-y-3.5">
              {props.cells.map((c) =>
                c.type === "motioncontrol" ? (
                  <MotionCell
                    key={c.id}
                    cell={c}
                    imageAssets={imageAssets}
                    videoAssets={videoAssets}
                    collapsed={!!collapsed[c.id]}
                    onToggle={() => toggleCollapse(c.id)}
                    onField={(patch) => updMC(c.id, patch)}
                    onGenerate={() => start(() => generateCellAction(props.workspaceId, c.id))}
                    onDup={() => start(() => duplicateCellAction(props.workspaceId, c.id))}
                    onDel={() => start(() => deleteCellAction(props.workspaceId, c.id))}
                  />
                ) : (
                  <Cell
                    key={c.id}
                    cell={c}
                    collapsed={!!collapsed[c.id]}
                    onToggle={() => toggleCollapse(c.id)}
                    onField={(patch) => updI2V(c.id, patch)}
                    onSetEnd={(assetId) => updI2V(c.id, { endAssetId: assetId })}
                    onSwap={() => start(() => swapFramesAction(props.workspaceId, c.id))}
                    onGenerate={() => start(() => generateCellAction(props.workspaceId, c.id))}
                    onDup={() => start(() => duplicateCellAction(props.workspaceId, c.id))}
                    onDel={() => start(() => deleteCellAction(props.workspaceId, c.id))}
                  />
                )
              )}
            </div>
          </div>
        </main>
      </div>

      {/* SETTINGS MODAL */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-semibold">Cài đặt</h3>
              <button onClick={() => setSettingsOpen(false)} className="rounded-lg px-2 py-1 text-muted hover:bg-white/10 hover:text-white">✕</button>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between border-b border-border py-3">
                <div>
                  <div className="text-sm font-medium">Hiển thị ảnh nguồn</div>
                  <div className="text-xs text-muted">Dạng lưới thu nhỏ hoặc danh sách</div>
                </div>
                <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
                  <button onClick={() => view !== "grid" && toggleView()} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === "grid" ? "bg-accent text-[#04212c]" : "text-muted"}`}>Lưới</button>
                  <button onClick={() => view !== "list" && toggleView()} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === "list" ? "bg-accent text-[#04212c]" : "text-muted"}`}>List</button>
                </div>
              </div>

              {/* theme presets */}
              <div className="border-b border-border py-4">
                <div className="mb-3 text-sm font-medium">Màu theme</div>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTheme(t.id)}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${activeTheme === t.id ? "border-accent bg-accent/15 text-white" : "border-border text-muted hover:border-accent/50 hover:text-white"}`}
                    >
                      <span className="h-4 w-4 flex-none rounded-full" style={{ background: t.color }} />
                      {t.label}
                      {activeTheme === t.id && <span className="ml-auto text-accent-soft">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => router.push(`/workspaces/${props.workspaceId}`)}
                className="flex w-full items-center justify-between py-3 text-left hover:text-accent-soft"
              >
                <div>
                  <div className="text-sm font-medium">Thành viên & cài đặt workspace</div>
                  <div className="text-xs text-muted">Thêm/xoá thành viên, phân quyền</div>
                </div>
                <span className="text-muted">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Image→Video Cell ──────────────────────────────────────────────────────────
function Cell({
  cell,
  collapsed,
  onToggle,
  onField,
  onSetEnd,
  onSwap,
  onGenerate,
  onDup,
  onDel,
}: {
  cell: CellView;
  collapsed: boolean;
  onToggle: () => void;
  onField: (patch: Parameters<typeof updateCellAction>[2]) => void;
  onSetEnd: (assetId: string) => void;
  onSwap: () => void;
  onGenerate: () => void;
  onDup: () => void;
  onDel: () => void;
}) {
  const [endOver, setEndOver] = useState(false);
  const st = ST[cell.status];
  const busy = cell.status === "queued" || cell.status === "submitted" || cell.status === "processing";

  const handle = (
    <button onClick={onToggle} title={collapsed ? "Mở rộng" : "Thu gọn"} className="flex w-6 flex-none items-center justify-center self-stretch border-r border-border text-muted hover:text-accent-soft">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: collapsed ? "none" : "rotate(90deg)" }}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );

  if (collapsed) {
    return (
      <div className="overflow-x-auto">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
          {handle}
          <img src={assetUrl(cell.startAssetId)} alt="" className="h-14 w-10 flex-none rounded-md border border-border object-cover" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">{cell.prompt || "(chưa có prompt)"}</div>
            <div className="mono mt-0.5 text-[10px] text-muted">{cell.modelName} · {cell.duration}s · {cell.mode}</div>
          </div>
          <span className={`mono flex-none text-[10.5px] ${st.c}`}>{st.t}</span>
          {cell.status === "succeeded" && cell.resultUrl && (
            <a href={cell.resultUrl} target="_blank" rel="noreferrer" className="flex-none text-accent-soft" title="Xem video">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[1060px] items-stretch rounded-xl border border-border bg-surface p-3">
        {handle}
        {/* frames */}
        <div className="relative ml-3 flex flex-none items-center gap-1.5">
          <img src={assetUrl(cell.startAssetId)} alt="start" className="h-[156px] w-[118px] flex-none rounded-lg border border-border object-cover" />
          {cell.endAssetId ? (
            <img src={assetUrl(cell.endAssetId)} alt="end" className="h-[156px] w-[118px] flex-none rounded-lg border border-border object-cover" />
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setEndOver(true); }}
              onDragLeave={() => setEndOver(false)}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setEndOver(false); const id = e.dataTransfer.getData("text/asset"); if (id) onSetEnd(id); }}
              className={`flex h-[156px] w-[118px] flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-[10px] ${endOver ? "border-accent text-accent-soft bg-accent/10" : "border-border text-muted"}`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></svg>
              End frame<br />(kéo ảnh vào)
            </div>
          )}
          {cell.endAssetId && (
            <button onClick={onSwap} title="Hoán đổi start/end" className="absolute left-1/2 top-1/2 z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-[#0d1116] text-white shadow-lg hover:border-accent hover:text-accent-soft">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 7h11l-3-3M16 17H5l3 3" /></svg>
            </button>
          )}
        </div>

        <div className="mx-4 w-px flex-none bg-border" />

        {/* controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap gap-2.5">
            <Field label="Model">
              <select defaultValue={cell.modelName} onChange={(e) => onField({ modelName: e.target.value })} className="kf-select">
                {MODELS_I2V.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Độ dài">
              <select defaultValue={cell.duration} onChange={(e) => onField({ duration: e.target.value })} className="kf-select">
                {DURATIONS.map((d) => <option key={d} value={d}>{d} giây</option>)}
              </select>
            </Field>
            <Field label="Mode">
              <select defaultValue={cell.mode} onChange={(e) => onField({ mode: e.target.value as "std" | "pro" | "4k" })} className="kf-select">
                <option value="std">Standard</option>
                <option value="pro">Professional</option>
                <option value="4k">4K</option>
              </select>
            </Field>
          </div>
          <textarea
            defaultValue={cell.prompt}
            onBlur={(e) => { if (e.target.value !== cell.prompt) onField({ prompt: e.target.value }); }}
            placeholder="Mô tả chuyển động mong muốn…"
            className="min-h-[54px] flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {cell.status === "failed" && cell.error && <p className="text-xs text-bad">{cell.error}</p>}
        </div>

        {/* actions */}
        <div className="mx-4 flex w-[134px] flex-none flex-col gap-3.5">
          <button
            onClick={onGenerate}
            disabled={busy}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-bold shadow-[0_6px_20px_-8px_rgba(95,208,142,.55)] ${busy ? "bg-gradient-to-b from-[#f6ec8a] to-yellow text-[#2c2700]" : "bg-gradient-to-b from-[#7fe3a8] to-ok text-[#04241a] hover:brightness-110"}`}
          >
            {cell.status === "processing" || cell.status === "submitted" || cell.status === "queued"
              ? "Đang chạy…"
              : cell.status === "succeeded"
                ? "Tạo lại"
                : "▶ Generate"}
          </button>
          <button onClick={onDup} className="rounded-lg border border-accent/50 bg-accent/15 px-1.5 py-2 text-[10.5px] font-semibold text-accent-soft hover:bg-accent/25">+ Biến thể</button>
          <button onClick={onDel} className="rounded-lg border border-border px-1.5 py-2 text-[10.5px] text-muted hover:border-yellow hover:text-yellow">Xoá ô</button>
        </div>

        {/* video result */}
        <div className="flex w-36 flex-none items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
          {cell.status === "succeeded" && cell.resultUrl ? (
            <a href={cell.resultUrl} target="_blank" rel="noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-2 text-accent-soft">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
              <span className="text-xs underline">Xem video</span>
            </a>
          ) : (
            <span className={`mono px-2 text-center ${st.c}`}>{st.t}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Motion Control Cell ───────────────────────────────────────────────────────
function MotionCell({
  cell,
  imageAssets,
  videoAssets,
  collapsed,
  onToggle,
  onField,
  onGenerate,
  onDup,
  onDel,
}: {
  cell: CellView;
  imageAssets: AssetView[];
  videoAssets: AssetView[];
  collapsed: boolean;
  onToggle: () => void;
  onField: (patch: Parameters<typeof updateMotionCellAction>[2]) => void;
  onGenerate: () => void;
  onDup: () => void;
  onDel: () => void;
}) {
  const [imgDropOver, setImgDropOver] = useState(false);
  const [vidDropOver, setVidDropOver] = useState(false);
  const st = ST[cell.status];
  const busy = cell.status === "queued" || cell.status === "submitted" || cell.status === "processing";

  const handle = (
    <button onClick={onToggle} title={collapsed ? "Mở rộng" : "Thu gọn"} className="flex w-6 flex-none items-center justify-center self-stretch border-r border-border text-muted hover:text-accent-soft">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: collapsed ? "none" : "rotate(90deg)" }}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );

  if (collapsed) {
    return (
      <div className="overflow-x-auto">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5" style={{ borderColor: "rgb(var(--color-accent)/0.35)", background: "rgb(var(--color-accent)/0.04)" }}>
          {handle}
          <img src={assetUrl(cell.startAssetId)} alt="" className="h-14 w-10 flex-none rounded-md border border-border object-cover" />
          <span className="mono flex-none rounded-md bg-accent/15 px-1.5 py-0.5 text-[9px] text-accent-soft">Motion Control</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">{cell.prompt || "(chưa có prompt)"}</div>
            <div className="mono mt-0.5 text-[10px] text-muted">{cell.modelName} · {cell.mode} · orient:{cell.characterOrientation}</div>
          </div>
          <span className={`mono flex-none text-[10.5px] ${st.c}`}>{st.t}</span>
          {cell.status === "succeeded" && cell.resultUrl && (
            <a href={cell.resultUrl} target="_blank" rel="noreferrer" className="flex-none text-accent-soft" title="Xem video">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[1060px] items-stretch rounded-xl border bg-surface p-3" style={{ borderColor: "rgb(var(--color-accent)/0.3)", background: "linear-gradient(135deg,rgb(var(--color-accent)/0.06),transparent)" }}>
        {handle}

        {/* ref image + ref video */}
        <div className="ml-3 flex flex-none flex-col gap-2">
          <span className="mono text-[9px] text-accent-soft">Ảnh tham chiếu</span>
          <div
            onDragOver={(e) => { e.preventDefault(); setImgDropOver(true); }}
            onDragLeave={() => setImgDropOver(false)}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setImgDropOver(false);
              const id = e.dataTransfer.getData("text/asset");
              const isImg = imageAssets.some((a) => a.id === id);
              if (id && isImg) onField({ imageAssetId: id });
            }}
            className={`relative h-[130px] w-[100px] flex-none overflow-hidden rounded-lg border border-dashed ${imgDropOver ? "border-accent bg-accent/10" : "border-border"}`}
          >
            {cell.startAssetId ? (
              <img src={assetUrl(cell.startAssetId)} alt="ref" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-[10px] text-muted">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></svg>
                Kéo ảnh vào
              </div>
            )}
          </div>

          <span className="mono text-[9px] text-accent-soft">Video chuyển động</span>
          <div
            onDragOver={(e) => { e.preventDefault(); setVidDropOver(true); }}
            onDragLeave={() => setVidDropOver(false)}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setVidDropOver(false);
              const id = e.dataTransfer.getData("text/asset");
              const isVid = videoAssets.some((a) => a.id === id);
              if (id && isVid) onField({ videoAssetId: id });
            }}
            className={`flex h-[100px] w-[100px] flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[10px] ${vidDropOver ? "border-accent text-accent-soft bg-accent/10" : "border-border text-muted"}`}
          >
            {cell.videoAssetId ? (
              <div className="flex flex-col items-center gap-1">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 5V3M16 5V3M3 10h18" /></svg>
                <span className="max-w-full truncate px-1 text-center text-accent-soft">
                  {videoAssets.find((a) => a.id === cell.videoAssetId)?.filename ?? "video"}
                </span>
              </div>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
                Kéo video vào
              </>
            )}
          </div>
        </div>

        <div className="mx-4 w-px flex-none bg-border" />

        {/* controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap gap-2.5">
            <Field label="Model">
              <select defaultValue={cell.modelName} onChange={(e) => onField({ modelName: e.target.value })} className="kf-select">
                {MODELS_MC.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Mode">
              <select defaultValue={cell.mode} onChange={(e) => onField({ mode: e.target.value as "std" | "pro" })} className="kf-select">
                <option value="std">Standard</option>
                <option value="pro">Professional</option>
              </select>
            </Field>
            <Field label="Character Orient.">
              <select defaultValue={cell.characterOrientation} onChange={(e) => onField({ characterOrientation: e.target.value as "image" | "video" })} className="kf-select">
                <option value="image">Image (video ≤10 s)</option>
                <option value="video">Video (video ≤30 s)</option>
              </select>
            </Field>
            <Field label="Keep Sound">
              <select defaultValue={cell.keepOriginalSound} onChange={(e) => onField({ keepOriginalSound: e.target.value as "yes" | "no" })} className="kf-select">
                <option value="yes">Giữ âm thanh gốc</option>
                <option value="no">Tắt âm thanh gốc</option>
              </select>
            </Field>
          </div>
          <textarea
            defaultValue={cell.prompt}
            onBlur={(e) => { if (e.target.value !== cell.prompt) onField({ prompt: e.target.value }); }}
            placeholder="Prompt bổ sung (tuỳ chọn)…"
            className="min-h-[54px] flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {cell.status === "failed" && cell.error && <p className="text-xs text-bad">{cell.error}</p>}
          <div className="mono rounded-md bg-accent/10 px-2 py-1 text-[10px] text-accent-soft">Motion Control 3.0</div>
        </div>

        {/* actions */}
        <div className="mx-4 flex w-[134px] flex-none flex-col gap-3.5">
          <button
            onClick={onGenerate}
            disabled={busy || !cell.videoAssetId}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-bold shadow-[0_6px_20px_-8px_rgba(95,208,142,.55)] ${busy ? "bg-gradient-to-b from-[#f6ec8a] to-yellow text-[#2c2700]" : !cell.videoAssetId ? "cursor-not-allowed bg-surface-2 text-muted" : "bg-gradient-to-b from-[#7fe3a8] to-ok text-[#04241a] hover:brightness-110"}`}
          >
            {cell.status === "processing" || cell.status === "submitted" || cell.status === "queued"
              ? "Đang chạy…"
              : !cell.videoAssetId
                ? "Cần video"
                : cell.status === "succeeded"
                  ? "Tạo lại"
                  : "▶ Generate"}
          </button>
          <button onClick={onDup} className="rounded-lg border border-accent/50 bg-accent/15 px-1.5 py-2 text-[10.5px] font-semibold text-accent-soft hover:bg-accent/25">+ Biến thể</button>
          <button onClick={onDel} className="rounded-lg border border-border px-1.5 py-2 text-[10.5px] text-muted hover:border-yellow hover:text-yellow">Xoá ô</button>
        </div>

        {/* video result */}
        <div className="flex w-36 flex-none items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
          {cell.status === "succeeded" && cell.resultUrl ? (
            <a href={cell.resultUrl} target="_blank" rel="noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-2 text-accent-soft">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
              <span className="text-xs underline">Xem video</span>
            </a>
          ) : (
            <span className={`mono px-2 text-center ${st.c}`}>{st.t}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="mono text-[9px] text-muted">{label}</span>
      {children}
    </label>
  );
}
