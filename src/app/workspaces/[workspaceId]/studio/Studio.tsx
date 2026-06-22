"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/app/auth-actions";
import type { JobStatus } from "@prisma/client";
import {
  uploadImagesAction,
  uploadVideosAction,
  createProjectAction,
  renameProjectAction,
  deleteProjectAction,
  createBatchAction,
  renameBatchAction,
  deleteBatchAction,
  createCellAction,
  createMotionCellAction,
  createAvatarCellAction,
  updateCellAction,
  updateMotionCellAction,
  updateAvatarCellAction,
  convertCellAction,
  duplicateCellAction,
  deleteCellAction,
  generateCellAction,
  generateAllAction,
  swapFramesAction,
  deleteMultipleCellsAction,
  generateMultipleCellsAction,
  updateMultipleCellsModeAction,
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
  libraryVideoId: string | null;
  prompt: string;
  modelName: string;
  mode: string;
  duration: string;
  characterOrientation: "image" | "video";
  keepOriginalSound: "yes" | "no";
  avatarId: string;
  avatarType: "2d" | "3d";
  voiceId: string;
  voiceLanguage: string;
  voiceSpeed: number;
  avatarText: string;
  resultUrls: (string | null)[];
  targetSlot: number | null;
};

type AssetView = { id: string; filename: string; mimeType: string | null };

type BatchView = { id: string; name: string; jobCount: number; createdAt: string };

type Props = {
  workspaceId: string;
  workspaceName: string;
  userName: string;
  userFullName: string;
  userRole: string;
  hasAccount: boolean;
  workerOnline: boolean;
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  activeBatchId: string | null;
  activeBatches: BatchView[];
  assets: AssetView[];
  cells: CellView[];
  libraryVideos: { id: string; name: string; filename: string }[];
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

const VOICE_LANGUAGES = [
  { value: "zh", label: "Chinese (ZH)" },
  { value: "en", label: "English (EN)" },
  { value: "ja", label: "Japanese (JA)" },
  { value: "ko", label: "Korean (KO)" },
  { value: "es", label: "Spanish (ES)" },
  { value: "fr", label: "French (FR)" },
  { value: "de", label: "German (DE)" },
  { value: "ar", label: "Arabic (AR)" },
  { value: "pt", label: "Portuguese (PT)" },
];

const VOICE_PRESETS = [
  { value: "zhishiting_general", label: "Zhishiting (ZH, F)" },
  { value: "zhiyu_general", label: "Zhiyu (ZH, M)" },
  { value: "en-US-AriaNeural", label: "Aria (EN, F)" },
  { value: "en-US-GuyNeural", label: "Guy (EN, M)" },
  { value: "ja-JP-NanamiNeural", label: "Nanami (JA, F)" },
  { value: "ko-KR-SunHiNeural", label: "SunHi (KO, F)" },
];

const ST: Record<JobStatus, { t: string; c: string }> = {
  draft: { t: "○ Nháp — chưa gửi", c: "text-muted" },
  queued: { t: "◔ Trong hàng đợi", c: "text-muted" },
  submitted: { t: "↗ Đang gọi API Kling…", c: "text-accent-soft" },
  processing: { t: "⟳ Kling đang tạo video…", c: "text-accent-soft" },
  succeeded: { t: "✓ Hoàn tất", c: "text-ok" },
  failed: { t: "✕ Lỗi — không tạo được", c: "text-bad" },
};
const assetUrl = (id: string) => `/api/assets/${id}`;

function genLabel(s: JobStatus): string {
  switch (s) {
    case "queued": return "◔ Trong hàng đợi";
    case "submitted": return "↗ Đang gọi API…";
    case "processing": return "⟳ Đang tạo…";
    case "succeeded": return "↻ Tạo lại";
    case "failed": return "↻ Thử lại";
    default: return "▶ Generate";
  }
}

const THEMES = [
  { id: "teal", label: "Studio Teal", color: "#2A7B9B" },
  { id: "sunset", label: "Sunset", color: "#e85a2e" },
  { id: "grape", label: "Neon Grape", color: "#8b45d4" },
  { id: "slate", label: "Mono Slate", color: "#647890" },
];

type CellTypeTab = "image2video" | "motioncontrol" | "avatar";

function TypeTabs({ active, onChange }: { active: CellTypeTab; onChange: (t: CellTypeTab) => void }) {
  const tabs: { id: CellTypeTab; label: string }[] = [
    { id: "image2video", label: "Video Generation" },
    { id: "motioncontrol", label: "Motion Control" },
    { id: "avatar", label: "Avatar" },
  ];
  return (
    <div className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5 text-[11px] font-medium">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => { if (t.id !== active) onChange(t.id); }}
          className={`rounded-md px-2.5 py-[5px] transition ${active === t.id ? "bg-accent/20 text-accent-soft" : "text-muted hover:text-white"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function Studio(props: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [imgOver, setImgOver] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState("teal");
  const [, start] = useTransition();
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [batchesSectionCollapsed, setBatchesSectionCollapsed] = useState(false);
  const [assetsSectionCollapsed, setAssetsSectionCollapsed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ jobId: string; label: string } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!userMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [userMenuOpen]);

  useEffect(() => {
    setSelectedCells(new Set());
    setBatchesSectionCollapsed(false);
    setAssetsSectionCollapsed(false);
  }, [props.activeProjectId]);

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
    start(() => uploadImagesAction(props.workspaceId, props.activeProjectId!, fd, props.activeBatchId ?? undefined));
  }
  function uploadVideos(files: FileList | null) {
    if (!files || !files.length || !props.activeProjectId) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    start(() => uploadVideosAction(props.workspaceId, props.activeProjectId!, fd, props.activeBatchId ?? undefined));
  }
  function handleCanvasDrop(assetId: string) {
    if (!props.activeProjectId || !props.activeBatchId) return;
    const asset = props.assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (asset.mimeType?.startsWith("video/")) {
      const imgId = imageAssets[0]?.id;
      if (!imgId) {
        alert("Hãy upload ít nhất một ảnh tham chiếu vào project trước khi tạo ô Motion Control.");
        return;
      }
      start(() => createMotionCellAction(props.workspaceId, props.activeProjectId!, imgId, assetId, props.activeBatchId!));
    } else {
      start(() => createCellAction(props.workspaceId, props.activeProjectId!, assetId, props.activeBatchId!));
    }
  }

  function handleCreateBatch(projectId: string) {
    start(async () => {
      const batchId = await createBatchAction(props.workspaceId, projectId);
      router.push(`/workspaces/${props.workspaceId}/studio?p=${projectId}&b=${batchId}`);
    });
  }
  function handleRenameBatch(batchId: string, currentName: string) {
    const name = window.prompt("Tên mới:", currentName);
    if (!name || name === currentName) return;
    start(() => renameBatchAction(props.workspaceId, batchId, name));
  }
  function handleDeleteBatch(batchId: string) {
    if (!confirm("Xoá batch này? Tất cả video trong batch sẽ bị xoá.")) return;
    start(async () => {
      await deleteBatchAction(props.workspaceId, batchId);
      if (batchId === props.activeBatchId && props.activeProjectId) {
        router.push(`/workspaces/${props.workspaceId}/studio?p=${props.activeProjectId}`);
      }
    });
  }
  function handleRenameProject(projectId: string, currentName: string) {
    const name = window.prompt("Tên mới:", currentName);
    if (!name || name === currentName) return;
    start(() => renameProjectAction(props.workspaceId, projectId, name));
  }
  function handleDeleteProject(projectId: string) {
    if (!confirm("Xoá project này? Tất cả batch và video sẽ bị xoá.")) return;
    start(async () => {
      await deleteProjectAction(props.workspaceId, projectId);
      if (projectId === props.activeProjectId) {
        router.push(`/workspaces/${props.workspaceId}/studio`);
      }
    });
  }

  const updI2V = (jobId: string, patch: Parameters<typeof updateCellAction>[2]) =>
    start(() => updateCellAction(props.workspaceId, jobId, patch));
  const updMC = (jobId: string, patch: Parameters<typeof updateMotionCellAction>[2]) =>
    start(() => updateMotionCellAction(props.workspaceId, jobId, patch));
  const updAvatar = (jobId: string, patch: Parameters<typeof updateAvatarCellAction>[2]) =>
    start(() => updateAvatarCellAction(props.workspaceId, jobId, patch));
  const conv = (jobId: string, type: CellTypeTab) =>
    start(() => convertCellAction(props.workspaceId, jobId, type));
  function handleGenerate(cell: CellView) {
    const nextEmpty = cell.resultUrls.findIndex((s) => !s);
    if (nextEmpty !== -1) {
      start(() => generateCellAction(props.workspaceId, cell.id, nextEmpty));
    } else {
      setConfirmOverwrite({ jobId: cell.id, label: `Output 1 của ô "${cell.prompt ? cell.prompt.slice(0, 20) + '…' : cell.id.slice(-6)}"` });
    }
  }

  function toggleSelect(id: string) {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function deselectAll() { setSelectedCells(new Set()); }
  function selectAllCells() { setSelectedCells(new Set(props.cells.map((c) => c.id))); }
  function handleBulkDelete() {
    const ids = Array.from(selectedCells);
    if (!ids.length) return;
    if (!confirm(`Xoá ${ids.length} ô đã chọn?`)) return;
    deselectAll();
    start(() => deleteMultipleCellsAction(props.workspaceId, ids));
  }
  function handleBulkGenerate() {
    const ids = Array.from(selectedCells);
    if (!ids.length) return;
    deselectAll();
    start(() => generateMultipleCellsAction(props.workspaceId, ids));
  }
  function handleBulkMode(mode: string) {
    const updates = props.cells
      .filter((c) => selectedCells.has(c.id))
      .map((c) => ({ id: c.id, type: c.type, mode }));
    if (!updates.length) return;
    start(() => updateMultipleCellsModeAction(props.workspaceId, updates));
  }

  return (
    <div className="flex h-screen flex-col">
      {/* ── HEADBAR ── */}
      <header className="flex h-[54px] flex-none items-center gap-4 border-b border-border bg-black/70 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5 font-semibold tracking-wide">
          <span
            className="grid h-[26px] w-[26px] flex-none place-items-center rounded-lg"
            style={{ background: "linear-gradient(135deg,rgb(var(--color-accent)),rgb(var(--color-accent-soft)))", boxShadow: "0 4px 14px -4px rgb(var(--color-accent)/0.7)" }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="#04212c"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 15l5 3-5 3z" /></svg>
          </span>
          <span className="text-sm">KlingDom Forge</span>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-border px-[11px] py-[5px] text-[12.5px] text-muted">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-ok" style={{ boxShadow: "0 0 8px rgb(var(--color-ok)/0.8)" }} />
          Workspace <span className="ml-1 font-semibold text-white">{props.workspaceName}</span>
        </div>

        <div className="flex-1" />

        <div
          className={`mono flex items-center gap-1.5 rounded-full border px-3 py-1 ${props.workerOnline ? "border-ok/40 text-ok" : "border-bad/50 text-bad"}`}
          title={props.workerOnline ? "Worker đang chạy — job sẽ được xử lý" : "Worker offline — chạy `npm run worker`"}
        >
          <span className={`h-1.5 w-1.5 flex-none rounded-full ${props.workerOnline ? "bg-ok" : "bg-bad"}`} />
          {props.workerOnline ? "Worker online" : "Worker offline"}
        </div>

        <div className="mono flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-muted">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" /></svg>
          {props.cells.length} ô{activeCells.length > 0 && ` · ${activeCells.length} đang chạy`}
        </div>

        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-[11px] font-bold text-[#06222c] transition hover:brightness-110"
            style={{ background: "conic-gradient(from 200deg,rgb(var(--color-accent)),rgb(var(--color-ok)),rgb(var(--color-yellow)),rgb(var(--color-accent)))" }}
            title={props.userFullName}
          >
            {props.userName}
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate text-xs font-medium text-white">{props.userFullName}</p>
              </div>
              <form action={signOutAction}>
                <button type="submit" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted hover:bg-white/5 hover:text-bad">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  Đăng xuất
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      {/* ── BODY ── */}
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
              const projectCollapsed = collapsedProjects.has(p.id);
              return (
                <div key={p.id} className={`mb-1 rounded-xl border ${on ? "border-accent/40 bg-accent/10" : "border-transparent"}`}>
                  {/* Project row */}
                  <div className="group flex items-center gap-0.5 rounded-xl px-1 py-0.5">
                    {on ? (
                      <button
                        onClick={() => setCollapsedProjects((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                        className="flex h-6 w-5 flex-none items-center justify-center text-muted hover:text-accent-soft"
                        title={projectCollapsed ? "Mở rộng" : "Thu gọn"}
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: projectCollapsed ? "none" : "rotate(90deg)", transition: "transform 0.15s" }}><path d="M9 6l6 6-6 6" /></svg>
                      </button>
                    ) : (
                      <span className="w-5 flex-none" />
                    )}
                    <button
                      onClick={() => switchProject(p.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5"
                    >
                      <span className="flex-1 truncate text-white">{p.name}</span>
                    </button>
                    <button
                      onClick={() => handleRenameProject(p.id, p.name)}
                      className="hidden h-6 w-6 flex-none items-center justify-center rounded text-muted hover:text-accent-soft group-hover:flex"
                      title="Đổi tên project"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                    </button>
                    <button
                      onClick={() => handleDeleteProject(p.id)}
                      className="hidden h-6 w-6 flex-none items-center justify-center rounded text-muted hover:text-bad group-hover:flex"
                      title="Xoá project"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M9 6V4h6v2" /></svg>
                    </button>
                  </div>

                  {on && !projectCollapsed && (
                    <div className="px-3 pb-3">
                      <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => { uploadImages(e.target.files); e.currentTarget.value = ""; }} />
                      <input ref={vidRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" multiple hidden onChange={(e) => { uploadVideos(e.target.files); e.currentTarget.value = ""; }} />

                      {/* ── Batches ── */}
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <button
                            onClick={() => setBatchesSectionCollapsed((v) => !v)}
                            className="mono flex items-center gap-1 text-muted hover:text-white"
                          >
                            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: batchesSectionCollapsed ? "none" : "rotate(90deg)", transition: "transform 0.15s" }}><path d="M9 6l6 6-6 6" /></svg>
                            Batches
                          </button>
                          <button
                            onClick={() => handleCreateBatch(p.id)}
                            className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent-soft"
                          >
                            + New
                          </button>
                        </div>
                        {!batchesSectionCollapsed && (
                          <div className="flex flex-col gap-0.5">
                            {props.activeBatches.map((b) => (
                              <div
                                key={b.id}
                                className={`group/batch flex items-center gap-1 rounded-lg px-1.5 py-1 ${b.id === props.activeBatchId ? "border border-accent/40 bg-accent/15" : "hover:bg-white/5"}`}
                              >
                                <button
                                  onClick={() => router.push(`/workspaces/${props.workspaceId}/studio?p=${p.id}&b=${b.id}`)}
                                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                >
                                  <span className={`h-1.5 w-1.5 flex-none rounded-full ${b.id === props.activeBatchId ? "bg-accent-soft" : "bg-border"}`} />
                                  <span className="truncate text-xs text-white">{b.name}</span>
                                  <span className="ml-auto flex-none text-[9px] text-muted">{b.jobCount}</span>
                                </button>
                                <button
                                  onClick={() => handleRenameBatch(b.id, b.name)}
                                  className="hidden h-5 w-5 flex-none items-center justify-center rounded text-muted hover:text-accent-soft group-hover/batch:flex"
                                  title="Đổi tên batch"
                                >
                                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteBatch(b.id)}
                                  className="hidden h-5 w-5 flex-none items-center justify-center rounded text-muted hover:text-bad group-hover/batch:flex"
                                  title="Xoá batch"
                                >
                                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M9 6V4h6v2" /></svg>
                                </button>
                              </div>
                            ))}
                            {props.activeBatches.length === 0 && (
                              <p className="py-1 text-center text-[11px] text-muted">Chưa có batch nào.</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ── Assets của batch đang chọn ── */}
                      {props.activeBatchId && (
                        <div className="mt-2 border-t border-border pt-2">
                          <div className="mb-2 flex items-center justify-between">
                            <button
                              onClick={() => setAssetsSectionCollapsed((v) => !v)}
                              className="flex items-center gap-1 text-xs text-muted hover:text-white"
                            >
                              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: assetsSectionCollapsed ? "none" : "rotate(90deg)", transition: "transform 0.15s" }}><path d="M9 6l6 6-6 6" /></svg>
                              Ảnh nguồn
                            </button>
                            <div className="flex items-center gap-1">
                              <button onClick={() => imgRef.current?.click()} className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent-soft">
                                + Ảnh
                              </button>
                              <button onClick={toggleView} title="Đổi cách xem" className="rounded-lg border border-border px-1.5 py-1 text-muted hover:border-accent hover:text-accent-soft">
                                {view === "grid" ? (
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                                )}
                              </button>
                            </div>
                          </div>
                          {!assetsSectionCollapsed && (
                            <>
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

                              <div className="mt-2 border-t border-border pt-2">
                                <div className="mb-1.5 flex items-center justify-between">
                                  <span className="mono text-[10px] text-muted">Video MC</span>
                                  <button onClick={() => vidRef.current?.click()} className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent-soft">
                                    + Video
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
                                <div className="mt-2 border-t border-border pt-2">
                                    <div className="mb-1 flex items-center justify-between">
                                      <span className="mono text-[10px] text-muted">Thư viện mẫu</span>
                                      {props.userRole === "super_admin" && (
                                        <button
                                          onClick={() => router.push("/admin/library")}
                                          className="rounded px-1.5 py-0.5 text-[9px] text-muted hover:text-accent-soft"
                                          title="Quản lý thư viện (super admin)"
                                        >
                                          + Quản lý
                                        </button>
                                      )}
                                    </div>
                                    {props.libraryVideos.length > 0 ? (
                                      <div className="flex flex-col gap-1">
                                        {props.libraryVideos.map((v) => (
                                          <div
                                            key={v.id}
                                            draggable
                                            onDragStart={(e) => e.dataTransfer.setData("text/library-video", v.id)}
                                            className="flex cursor-grab items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-1.5 hover:border-accent-soft"
                                          >
                                            <span className="grid h-6 w-6 flex-none place-items-center rounded bg-accent/15 text-accent-soft">
                                              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
                                            </span>
                                            <span className="truncate text-xs text-accent-soft">{v.name}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-center text-[10px] text-muted">
                                        {props.userRole === "super_admin" ? (
                                          <button onClick={() => router.push("/admin/library")} className="underline hover:text-accent-soft">Upload video mẫu đầu tiên →</button>
                                        ) : "Thư viện trống."}
                                      </p>
                                    )}
                                  </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
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
              <div className="mono text-muted">
                {props.workspaceName.toUpperCase()}
                {active && <> / {active.name.toUpperCase()}</>}
                {props.activeBatchId && props.activeBatches.length > 0 && (
                  <> / {(props.activeBatches.find((b) => b.id === props.activeBatchId)?.name ?? "").toUpperCase()}</>
                )}
              </div>
              <h1 className="mt-1 text-xl font-semibold">
                {!active ? "Chưa có project" : (props.activeBatches.find((b) => b.id === props.activeBatchId)?.name ?? active.name)}
              </h1>
            </div>
            {active && props.activeBatchId && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => collapseAll(!props.cells.every((c) => collapsed[c.id]))}
                  className="rounded-full border border-border px-3 py-2 text-sm text-muted hover:border-accent hover:text-white"
                >
                  Thu/Mở tất cả
                </button>
                <button
                  onClick={() => selectedCells.size > 0 ? deselectAll() : selectAllCells()}
                  className={`rounded-full border px-3 py-2 text-sm transition ${selectedCells.size > 0 ? "border-accent/50 text-accent-soft hover:border-accent" : "border-border text-muted hover:border-accent hover:text-white"}`}
                >
                  {selectedCells.size > 0 ? `☑ ${selectedCells.size} đã chọn` : "Chọn tất cả"}
                </button>
                <button
                  onClick={() => start(() => createAvatarCellAction(props.workspaceId, active.id, props.activeBatchId!))}
                  className="rounded-full border border-yellow/40 px-3 py-2 text-sm text-yellow hover:border-yellow hover:bg-yellow/10"
                >
                  + Avatar
                </button>
                <button
                  onClick={() => start(() => generateAllAction(props.workspaceId, active.id, props.activeBatchId!))}
                  className="rounded-full bg-gradient-to-b from-[#7fe3a8] to-ok px-4 py-2 text-sm font-semibold text-[#04241a] shadow-[0_6px_20px_-6px_rgba(95,208,142,.6)] hover:brightness-110"
                >
                  ▶ Generate tất cả
                </button>
              </div>
            )}
          </div>

          <div
            onDragOver={(e) => { if (active && props.activeBatchId) { e.preventDefault(); setImgOver(true); } }}
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
            {props.hasAccount && !props.workerOnline && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-yellow/45 bg-yellow/10 px-4 py-3 text-sm text-yellow">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span>Tiến trình <b>worker đang offline</b> — job sẽ nằm trong hàng đợi và không chạy. Mở terminal chạy <code className="rounded bg-black/30 px-1">npm run worker</code> (hoặc <code className="rounded bg-black/30 px-1">npm run dev:all</code>).</span>
              </div>
            )}
            {!active && <p className="text-muted">Tạo một project ở thanh bên để bắt đầu.</p>}
            {active && !props.activeBatchId && (
              <div className="flex h-[70%] min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-muted">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
                </div>
                <h3 className="font-semibold text-white">Chưa có batch nào</h3>
                <p className="max-w-sm text-sm text-muted">Tạo một batch ở thanh bên để bắt đầu làm việc với project này.</p>
                <button
                  onClick={() => handleCreateBatch(active.id)}
                  className="mt-1 rounded-full border border-accent/45 px-4 py-2 text-sm font-medium text-accent-soft hover:border-accent hover:bg-accent/10"
                >
                  + Tạo batch đầu tiên
                </button>
              </div>
            )}
            {active && props.activeBatchId && props.cells.length === 0 && (
              <div className={`flex h-[70%] min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center ${imgOver ? "border-accent bg-accent/10" : "border-border"}`}>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-accent-soft">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 14l4-4 5 5 3-3 6 6" /><circle cx="8.5" cy="8.5" r="1.6" /></svg>
                </div>
                <h3 className="font-semibold text-white">Vùng làm việc trống</h3>
                <p className="max-w-sm text-sm text-muted">Kéo ảnh → ô Video Generation. Kéo video → ô Motion Control. Hoặc bấm "+ Avatar".</p>
              </div>
            )}

            {selectedCells.size > 0 && (
              <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/45 bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur-sm">
                <span className="mono text-sm font-semibold text-accent-soft">{selectedCells.size} ô đã chọn</span>
                <div className="flex-1" />
                <button
                  onClick={() => selectAllCells()}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-white"
                >
                  Chọn tất cả
                </button>
                <button
                  onClick={handleBulkGenerate}
                  className="rounded-lg bg-gradient-to-b from-[#7fe3a8] to-ok px-3 py-1.5 text-xs font-bold text-[#04241a] hover:brightness-110"
                >
                  ▶ Generate
                </button>
                <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
                  <span className="mono px-1.5 text-[9px] text-muted">Mode:</span>
                  {["std", "pro", "4k"].map((m) => (
                    <button
                      key={m}
                      onClick={() => handleBulkMode(m)}
                      className="rounded-md px-2 py-1 text-[10.5px] font-semibold text-muted hover:bg-accent/20 hover:text-accent-soft"
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleBulkDelete}
                  className="rounded-lg border border-bad/50 px-3 py-1.5 text-xs text-bad hover:border-bad hover:bg-bad/10"
                >
                  Xoá
                </button>
                <button
                  onClick={deselectAll}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-white"
                >
                  ✕ Bỏ chọn
                </button>
              </div>
            )}

            <div className="space-y-3.5">
              {props.cells.map((c) => {
                const shared = {
                  key: c.id,
                  cell: c,
                  collapsed: !!collapsed[c.id],
                  selected: selectedCells.has(c.id),
                  onSelect: () => toggleSelect(c.id),
                  onToggle: () => toggleCollapse(c.id),
                  onGenerate: () => handleGenerate(c),
                  onDup: () => start(() => duplicateCellAction(props.workspaceId, c.id)),
                  onDel: () => start(() => deleteCellAction(props.workspaceId, c.id)),
                  onConvert: (t: CellTypeTab) => conv(c.id, t),
                  onPreview: (url: string) => { setPreviewUrl(url); setPreviewOpen(true); },
                };
                if (c.type === "motioncontrol") {
                  return <MotionCell {...shared} imageAssets={imageAssets} videoAssets={videoAssets} libraryVideos={props.libraryVideos} onField={(p) => updMC(c.id, p)} />;
                }
                if (c.type === "avatar") {
                  return <AvatarCell {...shared} onField={(p) => updAvatar(c.id, p)} />;
                }
                return (
                  <Cell
                    {...shared}
                    onField={(p) => updI2V(c.id, p)}
                    onSetEnd={(assetId) => updI2V(c.id, { endAssetId: assetId })}
                    onSwap={() => start(() => swapFramesAction(props.workspaceId, c.id))}
                  />
                );
              })}
            </div>
          </div>
        </main>
        <PreviewSidebar url={previewUrl} open={previewOpen} onToggle={() => setPreviewOpen((v) => !v)} />
      </div>

      {/* OVERWRITE CONFIRM TOAST */}
      {confirmOverwrite && (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-yellow/45 bg-surface p-4 shadow-2xl backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-yellow">Đã có đủ 3 outputs</p>
            <p className="mt-1 text-[11px] text-muted">Ghi đè {confirmOverwrite.label}?</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => { start(() => generateCellAction(props.workspaceId, confirmOverwrite.jobId, 0)); setConfirmOverwrite(null); }}
              className="rounded-lg bg-yellow/20 px-3 py-1.5 text-[11px] font-bold text-yellow hover:bg-yellow/30"
            >
              Ghi đè
            </button>
            <button onClick={() => setConfirmOverwrite(null)} className="rounded-lg px-3 py-1.5 text-[11px] text-muted hover:text-white">
              Huỷ
            </button>
          </div>
        </div>
      )}
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
  cell, collapsed, selected, onSelect, onToggle, onField, onSetEnd, onSwap, onGenerate, onDup, onDel, onConvert, onPreview,
}: {
  cell: CellView;
  collapsed: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onField: (patch: Parameters<typeof updateCellAction>[2]) => void;
  onSetEnd: (assetId: string) => void;
  onSwap: () => void;
  onGenerate: () => void;
  onDup: () => void;
  onDel: () => void;
  onConvert: (t: CellTypeTab) => void;
  onPreview: (url: string) => void;
}) {
  const [endOver, setEndOver] = useState(false);
  const st = ST[cell.status];
  const busy = cell.status === "queued" || cell.status === "submitted" || cell.status === "processing";

  const selBox = (
    <button
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      title={selected ? "Bỏ chọn" : "Chọn ô này"}
      className={`flex w-5 flex-none items-center justify-center self-stretch transition ${selected ? "text-accent-soft" : "text-border/60 hover:text-muted"}`}
    >
      {selected ? (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="14" height="14" rx="2.5" fillOpacity="0.25" fill="currentColor" />
          <rect x="1" y="1" width="14" height="14" rx="2.5" />
          <path d="M4 8.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="14" height="14" rx="2.5" />
        </svg>
      )}
    </button>
  );

  const handle = (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="flex w-6 flex-none items-center justify-center self-stretch border-r border-border text-muted hover:text-accent-soft">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: collapsed ? "none" : "rotate(90deg)" }}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );

  if (collapsed) {
    return (
      <div className="overflow-x-auto">
        <div
          onClick={onSelect}
          className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-surface p-2.5 transition ${selected ? "border-accent/60 bg-accent/5" : "border-border hover:border-border/80"}`}
        >
          {selBox}
          {handle}
          {cell.startAssetId ? (
            <img src={assetUrl(cell.startAssetId)} alt="" className="h-14 w-10 flex-none rounded-md border border-border object-cover" />
          ) : (
            <div className="h-14 w-10 flex-none rounded-md border border-dashed border-border" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">{cell.prompt || "(chưa có prompt)"}</div>
            <div className="mono mt-0.5 flex items-center gap-1 text-[10px] text-muted"><span>{cell.modelName} · {cell.duration}s · {cell.mode}</span><span className="ml-auto text-[9px]">{cell.resultUrls.filter(Boolean).length}/3</span></div>
          </div>
          <span className={`mono flex-none text-[10.5px] ${st.c}`}>{st.t}</span>
          {cell.status === "succeeded" && cell.resultUrl && (
            <button onClick={(e) => { e.stopPropagation(); onPreview(cell.resultUrl!); }} className="flex-none text-accent-soft hover:text-white" title="Xem trong Preview Sidebar">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className={`flex min-w-[1060px] items-stretch rounded-xl border bg-surface p-3 transition ${selected ? "border-accent/60 bg-accent/5" : "border-border"}`}>
        {selBox}
        {handle}
        {/* frames */}
        <div className="relative ml-3 flex flex-none items-center gap-1.5">
          {cell.startAssetId ? (
            <img src={assetUrl(cell.startAssetId)} alt="start" className="h-[156px] w-[118px] flex-none rounded-lg border border-border object-cover" />
          ) : (
            <div className="flex h-[156px] w-[118px] flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center text-[10px] text-muted">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></svg>
              Kéo ảnh vào
            </div>
          )}
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
            <button onClick={onSwap} className="absolute left-1/2 top-1/2 z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-[#0d1116] text-white shadow-lg hover:border-accent hover:text-accent-soft">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 7h11l-3-3M16 17H5l3 3" /></svg>
            </button>
          )}
        </div>

        <div className="mx-4 w-px flex-none bg-border" />

        {/* controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeTabs active="image2video" onChange={onConvert} />
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
            <Field label="Quality">
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
            {genLabel(cell.status)}
          </button>
          <button onClick={onDup} className="rounded-lg border border-accent/50 bg-accent/15 px-1.5 py-2 text-[10.5px] font-semibold text-accent-soft hover:bg-accent/25">+ Biến thể</button>
          <button onClick={onDel} className="rounded-lg border border-border px-1.5 py-2 text-[10.5px] text-muted hover:border-yellow hover:text-yellow">Xoá ô</button>
        </div>

        {/* result — 3 slots */}
        <div className="flex w-36 flex-none flex-col gap-1 overflow-hidden rounded-xl border border-border bg-surface-2 p-2">
          {cell.resultUrls.map((url, i) => {
            const isGenerating = !url && cell.targetSlot === i && (cell.status === "queued" || cell.status === "submitted" || cell.status === "processing");
            return (
              <div key={i}>
                {url ? (
                  <button onClick={() => onPreview(url)} className="flex w-full items-center gap-1.5 rounded-lg border border-ok/30 bg-ok/5 px-2 py-1.5 text-[11px] text-ok hover:bg-ok/10">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" className="flex-none"><path d="M5 3l14 9-14 9z" /></svg>
                    <span className="truncate">Output {i + 1}</span>
                  </button>
                ) : isGenerating ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-2 py-1.5 text-[10px] text-accent-soft">
                    <span>⟳</span>
                    <span className="truncate">{cell.status === "queued" ? "Đợi..." : "Đang tạo"}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-2 py-1.5 text-[10px] text-muted">○ Slot {i + 1}</div>
                )}
              </div>
            );
          })}
          {cell.status === "failed" && cell.error && (
            <p className="mt-0.5 line-clamp-2 text-[9px] text-bad">{cell.error}</p>
          )}
          {!cell.resultUrls.some(Boolean) && cell.status !== "failed" && (
            <p className={`mono mt-0.5 text-center text-[9px] ${st.c}`}>{st.t}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Motion Control Cell ───────────────────────────────────────────────────────
function MotionCell({
  cell, imageAssets, videoAssets, libraryVideos, collapsed, selected, onSelect, onToggle, onField, onGenerate, onDup, onDel, onConvert, onPreview,
}: {
  cell: CellView;
  imageAssets: AssetView[];
  videoAssets: AssetView[];
  libraryVideos: { id: string; name: string; filename: string }[];
  collapsed: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onField: (patch: Parameters<typeof updateMotionCellAction>[2]) => void;
  onGenerate: () => void;
  onDup: () => void;
  onDel: () => void;
  onConvert: (t: CellTypeTab) => void;
  onPreview: (url: string) => void;
}) {
  const [imgDropOver, setImgDropOver] = useState(false);
  const [vidDropOver, setVidDropOver] = useState(false);
  const [libPickerOpen, setLibPickerOpen] = useState(false);
  const st = ST[cell.status];
  const busy = cell.status === "queued" || cell.status === "submitted" || cell.status === "processing";

  const selBox = (
    <button
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      title={selected ? "Bỏ chọn" : "Chọn ô này"}
      className={`flex w-5 flex-none items-center justify-center self-stretch transition ${selected ? "text-accent-soft" : "text-border/60 hover:text-muted"}`}
    >
      {selected ? (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="14" height="14" rx="2.5" fillOpacity="0.25" fill="currentColor" />
          <rect x="1" y="1" width="14" height="14" rx="2.5" />
          <path d="M4 8.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="14" height="14" rx="2.5" />
        </svg>
      )}
    </button>
  );

  const handle = (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="flex w-6 flex-none items-center justify-center self-stretch border-r border-border text-muted hover:text-accent-soft">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: collapsed ? "none" : "rotate(90deg)" }}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );

  if (collapsed) {
    return (
      <div className="overflow-x-auto">
        <div
          onClick={onSelect}
          className="flex cursor-pointer items-center gap-3 rounded-xl border bg-surface p-2.5 transition"
          style={selected
            ? { borderColor: "rgb(var(--color-accent)/0.6)", background: "rgb(var(--color-accent)/0.08)" }
            : { borderColor: "rgb(var(--color-accent)/0.35)", background: "rgb(var(--color-accent)/0.04)" }}
        >
          {selBox}
          {handle}
          {cell.startAssetId ? (
            <img src={assetUrl(cell.startAssetId)} alt="" className="h-14 w-10 flex-none rounded-md border border-border object-cover" />
          ) : (
            <div className="h-14 w-10 flex-none rounded-md border border-dashed border-border" />
          )}
          <span className="mono flex-none rounded-md bg-accent/15 px-1.5 py-0.5 text-[9px] text-accent-soft">Motion Control</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">{cell.prompt || "(chưa có prompt)"}</div>
            <div className="mono mt-0.5 flex items-center gap-1 text-[10px] text-muted"><span>{cell.modelName} · {cell.mode} · orient:{cell.characterOrientation}</span><span className="ml-auto text-[9px]">{cell.resultUrls.filter(Boolean).length}/3</span></div>
          </div>
          <span className={`mono flex-none text-[10.5px] ${st.c}`}>{st.t}</span>
          {cell.status === "succeeded" && cell.resultUrl && (
            <button onClick={(e) => { e.stopPropagation(); onPreview(cell.resultUrl!); }} className="flex-none text-accent-soft hover:text-white" title="Xem trong Preview Sidebar">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="flex min-w-[1060px] items-stretch rounded-xl border bg-surface p-3 transition"
        style={selected
          ? { borderColor: "rgb(var(--color-accent)/0.6)", background: "linear-gradient(135deg,rgb(var(--color-accent)/0.1),transparent)" }
          : { borderColor: "rgb(var(--color-accent)/0.3)", background: "linear-gradient(135deg,rgb(var(--color-accent)/0.06),transparent)" }}
      >
        {selBox}
        {handle}

        {/* ref image + ref video */}
        <div className="relative ml-3 flex flex-none flex-col gap-2">
          <span className="mono text-[9px] text-accent-soft">Ảnh tham chiếu</span>
          <div
            onDragOver={(e) => { e.preventDefault(); setImgDropOver(true); }}
            onDragLeave={() => setImgDropOver(false)}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setImgDropOver(false);
              const id = e.dataTransfer.getData("text/asset");
              if (id && imageAssets.some((a) => a.id === id)) onField({ imageAssetId: id });
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
              const libId = e.dataTransfer.getData("text/library-video");
              if (libId) { onField({ libraryVideoId: libId, videoAssetId: null }); return; }
              const id = e.dataTransfer.getData("text/asset");
              if (id && videoAssets.some((a) => a.id === id)) onField({ videoAssetId: id, libraryVideoId: null });
            }}
            className={`flex h-[100px] w-[100px] flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[10px] ${vidDropOver ? "border-accent text-accent-soft bg-accent/10" : "border-border text-muted"}`}
          >
            {cell.libraryVideoId ? (
              <div className="flex flex-col items-center gap-1 px-1">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="text-accent-soft"><path d="M5 3l14 9-14 9z" /></svg>
                <span className="max-w-full truncate text-center text-accent-soft">
                  {libraryVideos.find((v) => v.id === cell.libraryVideoId)?.name ?? "Thư viện"}
                </span>
                <span className="rounded bg-accent/15 px-1 text-[9px] text-accent-soft">Mẫu</span>
              </div>
            ) : cell.videoAssetId ? (
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
          {libraryVideos.length > 0 && (
            <button
              onClick={() => setLibPickerOpen((o) => !o)}
              className="w-full rounded-lg border border-accent/30 bg-accent/5 px-2 py-1 text-center text-[10px] text-accent-soft hover:border-accent hover:bg-accent/15"
            >
              Chọn từ thư viện
            </button>
          )}
          {libPickerOpen && (
            <div className="absolute left-0 top-full z-40 mt-1 w-[220px] overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
              <div className="border-b border-border px-3 py-2 text-[10px] font-semibold text-muted">Thư viện video mẫu</div>
              <div className="max-h-[240px] overflow-y-auto p-1.5">
                {libraryVideos.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => { onField({ libraryVideoId: v.id, videoAssetId: null }); setLibPickerOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/5"
                  >
                    <video src={`/api/library/${v.id}`} muted preload="metadata" className="h-10 w-14 flex-none rounded object-cover bg-black" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-white">{v.name}</div>
                      <div className="truncate text-[9px] text-muted">{v.filename}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mx-4 w-px flex-none bg-border" />

        {/* controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeTabs active="motioncontrol" onChange={onConvert} />
            <Field label="Model">
              <select defaultValue={cell.modelName} onChange={(e) => onField({ modelName: e.target.value })} className="kf-select">
                {MODELS_MC.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Quality">
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
            disabled={busy || (!cell.videoAssetId && !cell.libraryVideoId)}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-bold shadow-[0_6px_20px_-8px_rgba(95,208,142,.55)] ${busy ? "bg-gradient-to-b from-[#f6ec8a] to-yellow text-[#2c2700]" : (!cell.videoAssetId && !cell.libraryVideoId) ? "cursor-not-allowed bg-surface-2 text-muted" : "bg-gradient-to-b from-[#7fe3a8] to-ok text-[#04241a] hover:brightness-110"}`}
          >
            {!busy && !cell.videoAssetId && !cell.libraryVideoId ? "Cần video" : genLabel(cell.status)}
          </button>
          <button onClick={onDup} className="rounded-lg border border-accent/50 bg-accent/15 px-1.5 py-2 text-[10.5px] font-semibold text-accent-soft hover:bg-accent/25">+ Biến thể</button>
          <button onClick={onDel} className="rounded-lg border border-border px-1.5 py-2 text-[10.5px] text-muted hover:border-yellow hover:text-yellow">Xoá ô</button>
        </div>

        {/* result — 3 slots */}
        <div className="flex w-36 flex-none flex-col gap-1 overflow-hidden rounded-xl border border-border bg-surface-2 p-2">
          {cell.resultUrls.map((url, i) => {
            const isGenerating = !url && cell.targetSlot === i && (cell.status === "queued" || cell.status === "submitted" || cell.status === "processing");
            return (
              <div key={i}>
                {url ? (
                  <button onClick={() => onPreview(url)} className="flex w-full items-center gap-1.5 rounded-lg border border-ok/30 bg-ok/5 px-2 py-1.5 text-[11px] text-ok hover:bg-ok/10">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" className="flex-none"><path d="M5 3l14 9-14 9z" /></svg>
                    <span className="truncate">Output {i + 1}</span>
                  </button>
                ) : isGenerating ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-2 py-1.5 text-[10px] text-accent-soft">
                    <span>⟳</span>
                    <span className="truncate">{cell.status === "queued" ? "Đợi..." : "Đang tạo"}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-2 py-1.5 text-[10px] text-muted">○ Slot {i + 1}</div>
                )}
              </div>
            );
          })}
          {cell.status === "failed" && cell.error && (
            <p className="mt-0.5 line-clamp-2 text-[9px] text-bad">{cell.error}</p>
          )}
          {!cell.resultUrls.some(Boolean) && cell.status !== "failed" && (
            <p className={`mono mt-0.5 text-center text-[9px] ${st.c}`}>{st.t}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Avatar Cell ───────────────────────────────────────────────────────────────
function AvatarCell({
  cell, collapsed, selected, onSelect, onToggle, onField, onGenerate, onDup, onDel, onConvert, onPreview,
}: {
  cell: CellView;
  collapsed: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onField: (patch: Parameters<typeof updateAvatarCellAction>[2]) => void;
  onGenerate: () => void;
  onDup: () => void;
  onDel: () => void;
  onConvert: (t: CellTypeTab) => void;
  onPreview: (url: string) => void;
}) {
  const st = ST[cell.status];
  const busy = cell.status === "queued" || cell.status === "submitted" || cell.status === "processing";
  const canGenerate = !busy && !!cell.avatarId && !!cell.voiceId && !!cell.avatarText;

  const selBox = (
    <button
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      title={selected ? "Bỏ chọn" : "Chọn ô này"}
      className={`flex w-5 flex-none items-center justify-center self-stretch transition ${selected ? "text-yellow" : "text-border/60 hover:text-muted"}`}
    >
      {selected ? (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="14" height="14" rx="2.5" fillOpacity="0.25" fill="currentColor" />
          <rect x="1" y="1" width="14" height="14" rx="2.5" />
          <path d="M4 8.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="14" height="14" rx="2.5" />
        </svg>
      )}
    </button>
  );

  const handle = (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="flex w-6 flex-none items-center justify-center self-stretch border-r border-border text-muted hover:text-accent-soft">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: collapsed ? "none" : "rotate(90deg)" }}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );

  if (collapsed) {
    return (
      <div className="overflow-x-auto">
        <div
          onClick={onSelect}
          className="flex cursor-pointer items-center gap-3 rounded-xl border bg-surface p-2.5 transition"
          style={selected
            ? { borderColor: "rgb(var(--color-yellow)/0.6)", background: "rgb(var(--color-yellow)/0.08)" }
            : { borderColor: "rgb(var(--color-yellow)/0.35)", background: "rgb(var(--color-yellow)/0.04)" }}
        >
          {selBox}
          {handle}
          <span className="grid h-14 w-10 flex-none place-items-center rounded-md border border-dashed border-yellow/40 text-yellow/60">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
          </span>
          <span className="mono flex-none rounded-md bg-yellow/15 px-1.5 py-0.5 text-[9px] text-yellow">Avatar</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">{cell.avatarText || "(chưa có văn bản)"}</div>
            <div className="mono mt-0.5 flex items-center gap-1 text-[10px] text-muted"><span>{cell.avatarId || "—"} · {cell.voiceId || "—"} · {cell.voiceLanguage}</span><span className="ml-auto text-[9px]">{cell.resultUrls.filter(Boolean).length}/3</span></div>
          </div>
          <span className={`mono flex-none text-[10.5px] ${st.c}`}>{st.t}</span>
          {cell.status === "succeeded" && cell.resultUrl && (
            <button onClick={(e) => { e.stopPropagation(); onPreview(cell.resultUrl!); }} className="flex-none text-accent-soft hover:text-white" title="Xem trong Preview Sidebar">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="flex min-w-[1060px] items-stretch rounded-xl border bg-surface p-3 transition"
        style={selected
          ? { borderColor: "rgb(var(--color-yellow)/0.6)", background: "linear-gradient(135deg,rgb(var(--color-yellow)/0.08),transparent)" }
          : { borderColor: "rgb(var(--color-yellow)/0.3)", background: "linear-gradient(135deg,rgb(var(--color-yellow)/0.05),transparent)" }}
      >
        {selBox}
        {handle}

        {/* avatar icon placeholder */}
        <div className="ml-3 flex h-[156px] w-[90px] flex-none flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-yellow/30 text-center text-[10px] text-yellow/60">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="12" cy="8" r="4.5" /><path d="M3 21c0-5 4-8.5 9-8.5s9 3.5 9 8.5" /></svg>
          Avatar
        </div>

        <div className="mx-4 w-px flex-none bg-border" />

        {/* controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeTabs active="avatar" onChange={onConvert} />
            <Field label="Avatar ID">
              <input
                defaultValue={cell.avatarId}
                onBlur={(e) => { if (e.target.value !== cell.avatarId) onField({ avatarId: e.target.value }); }}
                placeholder="e.g. avatar_anime_girl_01"
                className="kf-select w-[160px] font-mono text-[11px]"
              />
            </Field>
            <Field label="Avatar Type">
              <select defaultValue={cell.avatarType} onChange={(e) => onField({ avatarType: e.target.value as "2d" | "3d" })} className="kf-select">
                <option value="2d">2D</option>
                <option value="3d">3D</option>
              </select>
            </Field>
            <Field label="Voice">
              <select defaultValue={cell.voiceId} onChange={(e) => onField({ voiceId: e.target.value })} className="kf-select w-[170px]">
                <option value="">— chọn giọng —</option>
                {VOICE_PRESETS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Language">
              <select defaultValue={cell.voiceLanguage} onChange={(e) => onField({ voiceLanguage: e.target.value })} className="kf-select">
                {VOICE_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </Field>
            <Field label="Speed">
              <input
                type="number" min="0.8" max="2.0" step="0.1"
                defaultValue={cell.voiceSpeed}
                onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== cell.voiceSpeed) onField({ voiceSpeed: v }); }}
                className="kf-select w-[64px]"
              />
            </Field>
          </div>
          <textarea
            defaultValue={cell.avatarText}
            onBlur={(e) => { if (e.target.value !== cell.avatarText) onField({ avatarText: e.target.value }); }}
            placeholder="Văn bản avatar sẽ nói…"
            className="min-h-[64px] flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {cell.status === "failed" && cell.error && <p className="text-xs text-bad">{cell.error}</p>}
          {(!cell.avatarId || !cell.voiceId || !cell.avatarText) && (
            <p className="text-[10px] text-yellow/70">Cần điền Avatar ID, Voice và Văn bản để generate.</p>
          )}
        </div>

        {/* actions */}
        <div className="mx-4 flex w-[134px] flex-none flex-col gap-3.5">
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-bold shadow-[0_6px_20px_-8px_rgba(95,208,142,.55)] ${busy ? "bg-gradient-to-b from-[#f6ec8a] to-yellow text-[#2c2700]" : !canGenerate ? "cursor-not-allowed bg-surface-2 text-muted" : "bg-gradient-to-b from-[#7fe3a8] to-ok text-[#04241a] hover:brightness-110"}`}
          >
            {busy ? genLabel(cell.status) : !canGenerate ? "Thiếu thông tin" : genLabel(cell.status)}
          </button>
          <button onClick={onDup} className="rounded-lg border border-accent/50 bg-accent/15 px-1.5 py-2 text-[10.5px] font-semibold text-accent-soft hover:bg-accent/25">+ Biến thể</button>
          <button onClick={onDel} className="rounded-lg border border-border px-1.5 py-2 text-[10.5px] text-muted hover:border-yellow hover:text-yellow">Xoá ô</button>
        </div>

        {/* result — 3 slots */}
        <div className="flex w-36 flex-none flex-col gap-1 overflow-hidden rounded-xl border border-border bg-surface-2 p-2">
          {cell.resultUrls.map((url, i) => {
            const isGenerating = !url && cell.targetSlot === i && (cell.status === "queued" || cell.status === "submitted" || cell.status === "processing");
            return (
              <div key={i}>
                {url ? (
                  <button onClick={() => onPreview(url)} className="flex w-full items-center gap-1.5 rounded-lg border border-ok/30 bg-ok/5 px-2 py-1.5 text-[11px] text-ok hover:bg-ok/10">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" className="flex-none"><path d="M5 3l14 9-14 9z" /></svg>
                    <span className="truncate">Output {i + 1}</span>
                  </button>
                ) : isGenerating ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-2 py-1.5 text-[10px] text-accent-soft">
                    <span>⟳</span>
                    <span className="truncate">{cell.status === "queued" ? "Đợi..." : "Đang tạo"}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-2 py-1.5 text-[10px] text-muted">○ Slot {i + 1}</div>
                )}
              </div>
            );
          })}
          {cell.status === "failed" && cell.error && (
            <p className="mt-0.5 line-clamp-2 text-[9px] text-bad">{cell.error}</p>
          )}
          {!cell.resultUrls.some(Boolean) && cell.status !== "failed" && (
            <p className={`mono mt-0.5 text-center text-[9px] ${st.c}`}>{st.t}</p>
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

// ── Preview Sidebar ───────────────────────────────────────────────────────────
function PreviewSidebar({ url, open, onToggle }: { url: string | null; open: boolean; onToggle: () => void }) {
  return (
    <div
      className="relative flex flex-none overflow-hidden border-l border-border bg-surface/40 transition-[width] duration-200"
      style={{ width: open ? 320 : 36 }}
    >
      {/* Narrow strip — always visible */}
      <div className="flex w-9 flex-none flex-col items-center gap-3 border-r border-border bg-surface/60 py-3">
        <button
          onClick={onToggle}
          title={open ? "Thu gọn Preview" : "Mở Preview Sidebar"}
          className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted transition hover:border-accent hover:text-accent-soft"
        >
          <svg
            viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"
            style={{ transform: open ? "none" : "rotate(180deg)", transition: "transform 0.2s" }}
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        {url && (
          <span className="h-1.5 w-1.5 rounded-full bg-ok" style={{ boxShadow: "0 0 6px rgb(var(--color-ok)/0.8)" }} title="Video sẵn sàng" />
        )}
        {!open && (
          <span
            className="mono origin-center -rotate-90 whitespace-nowrap text-[9px] text-muted"
            style={{ marginTop: 8 }}
          >
            Preview
          </span>
        )}
      </div>

      {/* Main panel — visible only when open */}
      {open && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="mono text-[11px] font-semibold text-accent-soft">Preview</span>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="mono text-[10px] text-muted hover:text-white" title="Mở trong tab mới">
                ↗
              </a>
            )}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-3">
            {url ? (
              <video
                key={url}
                src={url}
                controls
                autoPlay
                className="w-full rounded-lg border border-border"
                style={{ maxHeight: "calc(100vh - 180px)" }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-center text-muted">
                <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M10 10l5 3-5 3z" />
                </svg>
                <p className="text-xs leading-relaxed">Bấm nút ▶ ở ô đã generate xong để preview tại đây</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
