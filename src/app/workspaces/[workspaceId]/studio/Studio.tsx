"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import { useDialog } from "@/components/ConfirmDialog";
import { isActiveOutputStatus, type OutputSlotStatus } from "@/lib/output-slots";
import {
  KLING_I2V_MODELS,
  KLING_IMAGE_MODE_OPTIONS,
  KLING_AVATAR_MODE_OPTIONS,
  KLING_MOTION_MODELS,
  KLING_MOTION_MODE_OPTIONS,
  KLING_MOTION_ORIENTATION_OPTIONS,
  KLING_SOUND_MODE_OPTIONS,
  KLING_VIDEO_RATIO_OPTIONS,
  getKlingImageCapabilities,
  canUseKlingNativeAudio,
  type KlingImageMode,
  type KlingMotionMode,
  type KlingVideoRatio,
} from "@/lib/kling-options";
import type { JobStatus } from "@prisma/client";
import {
  uploadImagesAction,
  uploadImagesAndCreateCellsAction,
  uploadAudioAction,
  uploadVideosAction,
  importGoogleDriveAction,
  createProjectAction,
  renameProjectAction,
  deleteProjectAction,
  createBatchAction,
  renameBatchAction,
  deleteBatchAction,
  createCellAction,
  createCellsAction,
  createMotionCellAction,
  createAvatarCellAction,
  updateCellAction,
  updateMotionCellAction,
  updateAvatarCellAction,
  convertCellAction,
  deleteAssetAction,
  deleteAssetsAction,
  deleteCellAction,
  generateCellAction,
  generateAllAction,
  swapFramesAction,
  deleteMultipleCellsAction,
  generateMultipleCellsAction,
  updateMultipleCellsModeAction,
  trimVideoAction,
} from "./actions";

export type CellView = {
  id: string;
  createdAt: string;
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
  videoRatio: KlingVideoRatio;
  nativeAudio: boolean;
  multiShot: boolean;
  characterOrientation: "image" | "video";
  keepOriginalSound: "yes" | "no";
  avatarAudioAssetId: string | null;
  avatarAudioId: string;
  avatarSoundUrl: string;
  avatarId: string;
  avatarType: "2d" | "3d";
  voiceId: string;
  voiceLanguage: string;
  voiceSpeed: number;
  avatarText: string;
  resultUrls: (string | null)[];
  slotStatuses: OutputSlotStatus[];
  slotErrors: (string | null)[];
  targetSlot: number | null;
};

type AssetView = { id: string; filename: string; mimeType: string | null; createdAt: string };

type BatchView = { id: string; name: string; jobCount: number; createdAt: string };

type PreviewVideo = { id: string; url: string; label: string; jobId: string; slot: number; name: string };
type OutputCtl = {
  previewed: Set<string>;
  downloaded: Set<string>;
  downloading: Set<string>;
  scrollTo: (id: string) => void;
  download: (jobId: string, slot: number, url: string, name: string) => void;
};

type AppRole = "super_admin" | "manager" | "member";

type LibraryVideoView = { id: string; name: string; filename: string; createdAt: string };

type AppSettingsData = {
  users: { id: string; email: string; name: string | null; role: AppRole; createdAt: string }[];
  workspaces: { id: string; name: string; hasKlingKey: boolean; createdAt: string }[];
} | null;

type Props = {
  workspaceId: string;
  workspaceName: string;
  accessibleWorkspaces: { id: string; name: string }[];
  userName: string;
  userFullName: string;
  userRole: string;
  hasAccount: boolean;
  workspaceHasKlingKey: boolean;
  workerOnline: boolean;
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  activeBatchId: string | null;
  activeBatches: BatchView[];
  assets: AssetView[];
  cells: CellView[];
  libraryVideos: LibraryVideoView[];
  appSettings: AppSettingsData;
  googleDriveAccessToken: string | null;
  googleDrivePickerApiKey: string | null;
  googleDriveAppId: string | null;
};

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

function slotLight(status: OutputSlotStatus, hasUrl: boolean) {
  if (status === "failed") return { dot: "bg-bad", text: "text-bad", border: "border-bad/40", bg: "bg-bad/5", label: "Lỗi" };
  if (status === "queued") return { dot: "bg-yellow", text: "text-yellow", border: "border-yellow/45", bg: "bg-yellow/10", label: "Queued" };
  if (status === "submitted") return { dot: "bg-yellow", text: "text-yellow", border: "border-yellow/45", bg: "bg-yellow/10", label: "Submitted" };
  if (status === "processing") return { dot: "bg-yellow", text: "text-yellow", border: "border-yellow/45", bg: "bg-yellow/10", label: "Processing" };
  if (status === "succeeded" || hasUrl) return { dot: "bg-ok", text: "text-ok", border: "border-ok/30", bg: "bg-ok/5", label: "Done" };
  return { dot: "bg-muted", text: "text-muted", border: "border-border", bg: "bg-transparent", label: "Idle" };
}

function activeSlotText(cell: CellView) {
  const active = cell.slotStatuses.filter(isActiveOutputStatus);
  if (active.length === 0) return "▶ Generate";
  const processing = active.filter((s) => s === "processing").length;
  const submitted = active.filter((s) => s === "submitted").length;
  const queued = active.filter((s) => s === "queued").length;
  return `+ Generate · ${processing ? `${processing} processing` : submitted ? `${submitted} submitted` : `${queued} queued`}`;
}

function hasActiveSlots(cell: CellView) {
  return cell.slotStatuses.some(isActiveOutputStatus);
}

function outputCountText(cell: CellView): string {
  const done = cell.resultUrls.filter(Boolean).length;
  const active = cell.slotStatuses.filter(isActiveOutputStatus).length;
  return active > 0 ? `${done} output · ${active} generating` : `${done} output`;
}

function cellStatusMeta(cell: CellView): { t: string; c: string } {
  const active = cell.slotStatuses.filter(isActiveOutputStatus);
  if (active.length > 0) {
    const processing = active.filter((s) => s === "processing").length;
    const submitted = active.filter((s) => s === "submitted").length;
    const queued = active.filter((s) => s === "queued").length;
    if (processing) return { t: `⟳ Kling đang tạo ${processing} slot…`, c: "text-yellow" };
    if (submitted) return { t: `↗ Đã gửi Kling ${submitted} slot…`, c: "text-yellow" };
    return { t: `◔ ${queued} slot trong hàng đợi`, c: "text-yellow" };
  }
  const failed = cell.slotStatuses.filter((s) => s === "failed").length;
  if (failed > 0) return { t: `✕ ${failed} slot lỗi`, c: "text-bad" };
  if (cell.resultUrls.some(Boolean)) return { t: "✓ Có output", c: "text-ok" };
  return ST[cell.status];
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

function SelCheckbox({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      title={selected ? "Bỏ chọn" : "Chọn ô này"}
      className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-md border transition ${
        selected
          ? "border-accent bg-accent/25 text-accent-soft shadow-[0_0_10px_rgb(var(--color-accent)/0.7)]"
          : "border-muted/60 text-muted/80 hover:border-accent hover:text-accent-soft"
      }`}
    >
      {selected ? (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1.5" y="1.5" width="13" height="13" rx="2.5" /></svg>
      )}
    </button>
  );
}

function CollapseBtn({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={collapsed ? "Mở rộng" : "Thu gọn"}
      className="grid h-[22px] w-[22px] flex-none place-items-center rounded-md text-muted transition hover:bg-white/5 hover:text-accent-soft"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: collapsed ? "none" : "rotate(90deg)", transition: "transform .15s" }}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}

/** Top-left header bar for an expanded cell: collapse, select, type tabs, then meta/status. */
function CellHeader({
  collapsed, selected, onToggle, onSelect, activeType, onConvert, meta, statusText, statusClass, dragId,
}: {
  collapsed: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  activeType: CellTypeTab;
  onConvert: (t: CellTypeTab) => void;
  meta?: string;
  statusText: string;
  statusClass: string;
  dragId: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
      <span
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/cell-reorder", dragId); e.dataTransfer.effectAllowed = "move"; }}
        title="Kéo để sắp xếp thứ tự"
        className="flex-none cursor-grab text-muted hover:text-white"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
      </span>
      <CollapseBtn collapsed={collapsed} onToggle={onToggle} />
      <SelCheckbox selected={selected} onSelect={onSelect} />
      <TypeTabs active={activeType} onChange={onConvert} />
      <div className="flex-1" />
      {meta && <span className="mono hidden text-[10px] text-muted lg:inline">{meta}</span>}
      <span className={`mono flex-none text-[10.5px] ${statusClass}`}>{statusText}</span>
    </div>
  );
}

declare global {
  interface Window {
    gapi?: {
      load: (name: string, opts: { callback: () => void; onerror?: () => void }) => void;
    };
    google?: {
      picker: {
        Action: { PICKED: string };
        Response: { ACTION: string; DOCUMENTS: string };
        Document: { ID: string };
        Feature: { MULTISELECT_ENABLED: string };
        DocsView: new () => any;
        PickerBuilder: new () => any;
      };
    };
  }
}

function loadGooglePickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker && window.gapi) return resolve();
    const existing = document.getElementById("google-api-js");
    if (existing) {
      existing.addEventListener("load", () => window.gapi?.load("picker", { callback: resolve, onerror: reject }));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = "google-api-js";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => window.gapi?.load("picker", { callback: resolve, onerror: reject });
    script.onerror = () => reject(new Error("Không tải được Google Picker API"));
    document.body.appendChild(script);
  });
}

export default function Studio(props: Props) {
  return <StudioInner {...props} />;
}

function StudioInner(props: Props) {
  const { confirm, notify, prompt } = useDialog();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [imgOver, setImgOver] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sortDir, setSortDir] = useState<"newest" | "oldest" | "custom">("newest");
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const lastClickedAsset = useRef<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [activeSettingsModule, setActiveSettingsModule] = useState<"role" | "api" | "motion">("role");
  const [activeTheme, setActiveTheme] = useState("teal");
  const [pending, start] = useTransition();
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [batchesSectionCollapsed, setBatchesSectionCollapsed] = useState(false);
  const [assetsSectionCollapsed, setAssetsSectionCollapsed] = useState(false);
  const [assetsDropOver, setAssetsDropOver] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewedUrls, setPreviewedUrls] = useState<Set<string>>(new Set());
  const [downloadedUrls, setDownloadedUrls] = useState<Set<string>>(new Set());
  const [downloadingUrls, setDownloadingUrls] = useState<Set<string>>(new Set());
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const wsMenuRef = useRef<HTMLDivElement>(null);
  const [trimModal, setTrimModal] = useState<{ assetId: string; filename: string } | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("kdf-view");
      if (v === "list" || v === "grid") setView(v);
      const s = localStorage.getItem("kdf-sort");
      if (s === "newest" || s === "oldest" || s === "custom") setSortDir(s);
      if (localStorage.getItem("kdf-sidebar") === "0") setSidebarOpen(false);
      const pv = localStorage.getItem("kdf-previewed");
      if (pv) setPreviewedUrls(new Set(JSON.parse(pv) as string[]));
      const dl = localStorage.getItem("kdf-downloaded");
      if (dl) setDownloadedUrls(new Set(JSON.parse(dl) as string[]));
      const c = localStorage.getItem("kdf-collapsed");
      if (c) setCollapsed(JSON.parse(c));
      const t = localStorage.getItem("kdf-theme") ?? "teal";
      setActiveTheme(t);
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedAssets(new Set()); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Custom cell order is per-batch — reload it whenever the active batch changes.
  useEffect(() => {
    if (!props.activeBatchId) { setCustomOrder([]); return; }
    try {
      const raw = localStorage.getItem(`kdf-order-${props.activeBatchId}`);
      setCustomOrder(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { setCustomOrder([]); }
  }, [props.activeBatchId]);

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
  function persistSort(n: "newest" | "oldest" | "custom") {
    setSortDir(n);
    try { localStorage.setItem("kdf-sort", n); } catch {}
  }
  // Toggle flips newest↔oldest; from "custom" it returns to newest. Custom is entered by dragging.
  function toggleSort() {
    persistSort(sortDir === "newest" ? "oldest" : "newest");
  }
  function toggleSidebar() {
    setSidebarOpen((o) => {
      const n = !o;
      try { localStorage.setItem("kdf-sidebar", n ? "1" : "0"); } catch {}
      return n;
    });
  }
  // Sort by createdAt; "custom" falls back to newest for generic lists (assets). Cells use orderCellsCustom.
  function bySortDir<T extends { createdAt: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) =>
      sortDir === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
    );
  }
  // Apply the user's drag-defined order: unknown (newly created) cells float to the top, newest-first.
  function orderCellsCustom(cells: CellView[]): CellView[] {
    const pos = new Map(customOrder.map((id, i) => [id, i]));
    const known = cells.filter((c) => pos.has(c.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
    const unknown = cells.filter((c) => !pos.has(c.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...unknown, ...known];
  }
  function reorderCells(draggedId: string, targetId: string, before: boolean) {
    if (draggedId === targetId) return;
    const base = sortedCells.map((c) => c.id);
    const without = base.filter((id) => id !== draggedId);
    const idx = without.indexOf(targetId);
    if (idx === -1) return;
    const insertAt = before ? idx : idx + 1;
    const next = [...without.slice(0, insertAt), draggedId, ...without.slice(insertAt)];
    persistSort("custom");
    setCustomOrder(next);
    if (props.activeBatchId) {
      try { localStorage.setItem(`kdf-order-${props.activeBatchId}`, JSON.stringify(next)); } catch {}
    }
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
  const imageAssets = bySortDir(props.assets.filter((a) => a.mimeType?.startsWith("image/")));
  const videoAssets = bySortDir(props.assets.filter((a) => a.mimeType?.startsWith("video/")));
  const audioAssets = bySortDir(props.assets.filter((a) => a.mimeType?.startsWith("audio/")));
  const sortedCells = sortDir === "custom" ? orderCellsCustom(props.cells) : bySortDir(props.cells);

  // Every generated output across all cells, auto-shown in the Preview column (in cell order).
  const previewVideos: PreviewVideo[] = sortedCells.flatMap((c) => {
    const nm = props.assets.find((a) => a.id === c.startAssetId)?.filename ?? "";
    return c.resultUrls
      .map((url, slot) => ({ url, slot }))
      .filter((x): x is { url: string; slot: number } => Boolean(x.url))
      .map(({ url, slot }) => ({
        id: `${c.id}:${slot}`,
        url: url as string,
        slot,
        jobId: c.id,
        name: nm || c.id,
        label: `${nm ? nm + " · " : ""}Output ${slot + 1}`,
      }));
  });

  // ── Multi-select for source images (click / Ctrl+click / Shift+click) ──
  function handleAssetClick(e: React.MouseEvent, assetId: string) {
    if (e.shiftKey && lastClickedAsset.current) {
      const ids = imageAssets.map((a) => a.id);
      const from = ids.indexOf(lastClickedAsset.current);
      const to = ids.indexOf(assetId);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setSelectedAssets(new Set(ids.slice(lo, hi + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedAssets((prev) => {
        const n = new Set(prev);
        if (n.has(assetId)) n.delete(assetId);
        else n.add(assetId);
        return n;
      });
      lastClickedAsset.current = assetId;
      return;
    }
    setSelectedAssets(new Set([assetId]));
    lastClickedAsset.current = assetId;
  }

  function handleAssetDragStart(e: React.DragEvent, assetId: string) {
    // Dragging an image that's part of a multi-selection drags the whole group;
    // otherwise just the one image (in current sort order).
    const ids =
      selectedAssets.has(assetId) && selectedAssets.size > 1
        ? imageAssets.filter((a) => selectedAssets.has(a.id)).map((a) => a.id)
        : [assetId];
    e.dataTransfer.setData("text/asset", ids[0]);
    if (ids.length > 1) e.dataTransfer.setData("text/asset-multi", JSON.stringify(ids));
  }

  function handleCanvasDropMulti(ids: string[]) {
    if (!props.activeProjectId || !props.activeBatchId) return;
    const imgIds = ids.filter((id) => props.assets.find((a) => a.id === id)?.mimeType?.startsWith("image/"));
    if (imgIds.length === 0) return;
    start(() => createCellsAction(props.workspaceId, props.activeProjectId!, imgIds, props.activeBatchId!));
    setSelectedAssets(new Set());
  }
  const activeCells = props.cells.filter(
    (c) =>
      c.status === "queued" ||
      c.status === "submitted" ||
      c.status === "processing" ||
      c.slotStatuses.some(isActiveOutputStatus),
  );
  const activeSlotCount = props.cells.reduce(
    (sum, c) => sum + c.slotStatuses.filter(isActiveOutputStatus).length,
    0,
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
    if (!wsMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target as Node)) {
        setWsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [wsMenuOpen]);

  useEffect(() => {
    setSelectedCells(new Set());
    setBatchesSectionCollapsed(false);
    setAssetsSectionCollapsed(false);
  }, [props.activeProjectId]);

  function switchProject(id: string) {
    router.push(`/workspaces/${props.workspaceId}/studio?p=${id}`);
  }
  function openNewProject() {
    setNewProjectName("");
    setNewProjectOpen(true);
  }
  function submitNewProject() {
    const name = newProjectName.trim();
    if (!name) return;
    start(async () => {
      const id = await createProjectAction(props.workspaceId, name);
      setNewProjectOpen(false);
      router.push(`/workspaces/${props.workspaceId}/studio?p=${id}`);
    });
  }
  function uploadImages(files: FileList | null) {
    if (!files || !files.length || !props.activeProjectId) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    start(() => uploadImagesAction(props.workspaceId, props.activeProjectId!, fd, props.activeBatchId ?? undefined));
  }
  // Files dropped onto the workspace: import into source assets AND create a cell per image.
  function uploadImagesToWorkspace(files: FileList | null) {
    if (!files || !files.length || !props.activeProjectId) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    start(() => uploadImagesAndCreateCellsAction(props.workspaceId, props.activeProjectId!, fd, props.activeBatchId ?? undefined));
  }
  function uploadVideos(files: FileList | null) {
    if (!files || !files.length || !props.activeProjectId) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    start(() => uploadVideosAction(props.workspaceId, props.activeProjectId!, fd, props.activeBatchId ?? undefined));
  }
  function uploadAudio(files: FileList | null) {
    if (!files || !files.length || !props.activeProjectId) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    start(() => uploadAudioAction(props.workspaceId, props.activeProjectId!, fd, props.activeBatchId ?? undefined));
  }
  async function importFromGoogleDrive() {
    if (!props.activeProjectId || !props.activeBatchId) return;
    if (props.googleDriveAccessToken && props.googleDrivePickerApiKey) {
      start(async () => {
        try {
          await loadGooglePickerApi();
          const picker = window.google?.picker;
          if (!picker) throw new Error("Google Picker chưa sẵn sàng");

          const view = new picker.DocsView()
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes(
              [
                "application/vnd.google-apps.folder",
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif",
                "video/mp4",
                "video/quicktime",
                "audio/mpeg",
                "audio/wav",
                "audio/mp4",
                "audio/aac",
              ].join(","),
            );

          let builder = new picker.PickerBuilder()
            .addView(view)
            .enableFeature(picker.Feature.MULTISELECT_ENABLED)
            .setOAuthToken(props.googleDriveAccessToken!)
            .setDeveloperKey(props.googleDrivePickerApiKey!)
            .setTitle("Chọn ảnh/video hoặc folder từ Google Drive")
            .setCallback((data: Record<string, unknown>) => {
              if (data[picker.Response.ACTION] !== picker.Action.PICKED) return;
              const docs = (data[picker.Response.DOCUMENTS] as Array<Record<string, unknown>> | undefined) ?? [];
              const ids = docs.map((d) => String(d[picker.Document.ID] ?? "")).filter(Boolean);
              if (ids.length === 0) return;
              start(async () => {
                try {
                  let imported = 0;
                  let found = 0;
                  let skipped = 0;
                  for (const id of ids) {
                    const result = await importGoogleDriveAction(
                      props.workspaceId,
                      props.activeProjectId!,
                      id,
                      props.activeBatchId!,
                    );
                    imported += result.imported;
                    found += result.totalFound;
                    skipped += result.skipped;
                  }
                  void notify(`Đã import ${imported}/${found} file từ Google Drive${skipped ? `, bỏ qua ${skipped}` : ""}.`);
                } catch (e) {
                  void notify(e instanceof Error ? e.message : "Import Google Drive thất bại");
                }
              });
            });

          if (props.googleDriveAppId) builder = builder.setAppId(props.googleDriveAppId);
          builder.build().setVisible(true);
        } catch (e) {
          void notify(e instanceof Error ? e.message : "Không mở được Google Drive Picker");
        }
      });
      return;
    }

    const link = await prompt({
      title: "Import từ Google Drive",
      message: props.googleDriveAccessToken
        ? "Google Picker chưa cấu hình API key. Dán link hoặc ID file/folder từ Google Drive:"
        : "Dán link hoặc ID file/folder từ Google Drive. Nếu là Drive riêng tư, đăng xuất rồi đăng nhập lại để cấp quyền Drive read-only.",
      placeholder: "https://drive.google.com/... hoặc raw ID",
      confirmLabel: "Import",
    });
    if (!link?.trim()) return;
    start(async () => {
      try {
        const result = await importGoogleDriveAction(
          props.workspaceId,
          props.activeProjectId!,
          link.trim(),
          props.activeBatchId!,
        );
        void notify(`Đã import ${result.imported}/${result.totalFound} file từ Google Drive${result.skipped ? `, bỏ qua ${result.skipped}` : ""}.`);
      } catch (e) {
        void notify(e instanceof Error ? e.message : "Import Google Drive thất bại");
      }
    });
  }
  function handleCanvasDrop(assetId: string) {
    if (!props.activeProjectId || !props.activeBatchId) return;
    const asset = props.assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (asset.mimeType?.startsWith("video/")) {
      const imgId = imageAssets[0]?.id;
      if (!imgId) {
        void notify("Hãy upload ít nhất một ảnh tham chiếu vào project trước khi tạo ô Motion Control.");
        return;
      }
      start(() => createMotionCellAction(props.workspaceId, props.activeProjectId!, imgId, assetId, props.activeBatchId!));
    } else if (asset.mimeType?.startsWith("image/")) {
      start(() => createCellAction(props.workspaceId, props.activeProjectId!, assetId, props.activeBatchId!));
    } else if (asset.mimeType?.startsWith("audio/")) {
      void notify("Kéo audio vào ô Avatar, hoặc tạo Avatar rồi chọn audio trong cell.");
    }
  }

  function handleCreateBatch(projectId: string) {
    start(async () => {
      const batchId = await createBatchAction(props.workspaceId, projectId);
      router.push(`/workspaces/${props.workspaceId}/studio?p=${projectId}&b=${batchId}`);
    });
  }
  async function handleRenameBatch(batchId: string, currentName: string) {
    const name = await prompt({ title: "Đổi tên batch", defaultValue: currentName, placeholder: "Tên batch…", confirmLabel: "Lưu" });
    const trimmed = name?.trim();
    if (!trimmed || trimmed === currentName) return;
    start(() => renameBatchAction(props.workspaceId, batchId, trimmed));
  }
  async function handleDeleteBatch(batchId: string) {
    if (!(await confirm({ title: "Xoá batch", message: "Xoá batch này? Tất cả video trong batch sẽ bị xoá.", danger: true, confirmLabel: "Xoá" }))) return;
    start(async () => {
      await deleteBatchAction(props.workspaceId, batchId);
      if (batchId === props.activeBatchId && props.activeProjectId) {
        router.push(`/workspaces/${props.workspaceId}/studio?p=${props.activeProjectId}`);
      }
    });
  }
  async function handleRenameProject(projectId: string, currentName: string) {
    const name = await prompt({ title: "Đổi tên project", defaultValue: currentName, placeholder: "Tên project…", confirmLabel: "Lưu" });
    const trimmed = name?.trim();
    if (!trimmed || trimmed === currentName) return;
    start(() => renameProjectAction(props.workspaceId, projectId, trimmed));
  }
  async function handleDeleteProject(projectId: string) {
    if (!(await confirm({ title: "Xoá project", message: "Xoá project này? Tất cả batch và video sẽ bị xoá.", danger: true, confirmLabel: "Xoá" }))) return;
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
  const conv = async (jobId: string, type: CellTypeTab) => {
    const ok = await confirm({ title: "Chuyển loại ô", message: "Cấu hình hiện tại sẽ bị xoá và không thể khôi phục. Tiếp tục?", confirmLabel: "Chuyển" });
    if (!ok) return;
    start(() => convertCellAction(props.workspaceId, jobId, type));
  };
  function handleGenerate(cell: CellView) {
    // Let the server choose the next available slot from the freshest DB state.
    // This keeps the button happily clickable even when the UI hasn't refreshed yet.
    start(() => generateCellAction(props.workspaceId, cell.id));
  }

  function toggleSelect(id: string) {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function deleteImage(assetId: string, filename: string) {
    if (!(await confirm({ title: "Xoá ảnh", message: `Xoá ảnh "${filename}" khỏi workspace?`, danger: true, confirmLabel: "Xoá" }))) return;
    start(() => deleteAssetAction(props.workspaceId, assetId));
  }
  async function deleteSelectedAssets() {
    const ids = [...selectedAssets];
    if (ids.length === 0) return;
    const usedCount = ids.filter((id) => props.cells.some((c) => c.startAssetId === id || c.endAssetId === id)).length;
    const warn = usedCount > 0 ? `\n\n⚠️ ${usedCount} ảnh đang được dùng trong ô — các ô đó sẽ mất ảnh tham chiếu.` : "";
    if (!(await confirm({ title: "Xoá ảnh", message: `Xoá ${ids.length} ảnh khỏi Assets nguồn?${warn}`, danger: true, confirmLabel: "Xoá" }))) return;
    start(() => deleteAssetsAction(props.workspaceId, ids));
    setSelectedAssets(new Set());
  }
  function deselectAll() { setSelectedCells(new Set()); }
  function selectAllCells() { setSelectedCells(new Set(props.cells.map((c) => c.id))); }
  async function handleBulkDelete() {
    const ids = Array.from(selectedCells);
    if (!ids.length) return;
    if (!(await confirm({ title: "Xoá ô", message: `Xoá ${ids.length} ô đã chọn?`, danger: true, confirmLabel: "Xoá" }))) return;
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

  function requestScrollToOutput(id: string) {
    setPreviewOpen(true);
    setScrollTarget((s) => ({ id, nonce: (s?.nonce ?? 0) + 1 }));
  }
  function markPreviewed(url: string) {
    setPreviewedUrls((prev) => {
      if (prev.has(url)) return prev;
      const n = new Set(prev);
      n.add(url);
      try { localStorage.setItem("kdf-previewed", JSON.stringify([...n])); } catch {}
      return n;
    });
  }
  async function downloadOutput(jobId: string, slot: number, url: string, name: string) {
    if (downloadingUrls.has(url)) return;
    setDownloadingUrls((prev) => new Set(prev).add(url));
    try {
      const q = new URLSearchParams({ slot: String(slot), name });
      const res = await fetch(`/api/jobs/${jobId}/download?${q.toString()}`);
      if (!res.ok) throw new Error("Tải video thất bại");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${name || jobId}-output${slot + 1}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      setDownloadedUrls((prev) => {
        const n = new Set(prev);
        n.add(url);
        try { localStorage.setItem("kdf-downloaded", JSON.stringify([...n])); } catch {}
        return n;
      });
    } catch (e) {
      void notify(e instanceof Error ? e.message : "Tải video thất bại");
    } finally {
      setDownloadingUrls((prev) => { const n = new Set(prev); n.delete(url); return n; });
    }
  }
  const outputCtl: OutputCtl = {
    previewed: previewedUrls,
    downloaded: downloadedUrls,
    downloading: downloadingUrls,
    scrollTo: requestScrollToOutput,
    download: downloadOutput,
  };

  return (
    <div className="flex h-screen flex-col">
      {/* ── HEADBAR ── */}
      <header className="flex h-[54px] flex-none items-center gap-4 border-b border-border bg-black/70 px-4 backdrop-blur-md">
        <Link href="/" title="Về trang chủ" className="flex items-center gap-2.5 font-semibold tracking-wide transition hover:opacity-80">
          <span
            className="grid h-[26px] w-[26px] flex-none place-items-center rounded-lg"
            style={{ background: "linear-gradient(135deg,rgb(var(--color-accent)),rgb(var(--color-accent-soft)))", boxShadow: "0 4px 14px -4px rgb(var(--color-accent)/0.7)" }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="#04212c"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 15l5 3-5 3z" /></svg>
          </span>
          <span className="text-sm">KlingDom Forge</span>
        </Link>

        <div ref={wsMenuRef} className="relative">
          <button
            onClick={() => setWsMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full border border-border px-[11px] py-[5px] text-[12.5px] text-muted transition hover:border-accent hover:text-white"
            title="Đổi workspace"
          >
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-ok" style={{ boxShadow: "0 0 8px rgb(var(--color-ok)/0.8)" }} />
            <span className="ml-0.5 font-semibold text-white">{props.workspaceName}</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: wsMenuOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {wsMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1.5 max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
              <p className="mono px-3 py-1.5 text-[9px] text-muted">Workspaces</p>
              {props.accessibleWorkspaces.map((w) => {
                const on = w.id === props.workspaceId;
                return (
                  <Link
                    key={w.id}
                    href={`/workspaces/${w.id}/studio`}
                    onClick={() => setWsMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 text-sm transition hover:bg-white/5 ${on ? "text-accent-soft" : "text-white"}`}
                  >
                    <span className="truncate">{w.name}</span>
                    {on && <span className="text-accent-soft">●</span>}
                  </Link>
                );
              })}
              {props.accessibleWorkspaces.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted">Chưa có workspace.</p>
              )}
              <Link
                href="/workspaces"
                onClick={() => setWsMenuOpen(false)}
                className="mt-1 flex items-center gap-1.5 border-t border-border px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-accent-soft"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                Tất cả workspaces
              </Link>
            </div>
          )}
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
          {props.cells.length} ô{activeSlotCount > 0 && ` · ${activeSlotCount} slot đang chạy`}
        </div>

        <UserMenu initials={props.userName} fullName={props.userFullName} role={props.userRole} />
      </header>

      {/* ── BODY ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* SIDEBAR */}
        {!sidebarOpen && (
          <div className="flex w-9 flex-none flex-col items-center gap-3 border-r border-border bg-surface/60 py-3">
            <button
              onClick={toggleSidebar}
              title="Mở cột Projects"
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted transition hover:border-accent hover:text-accent-soft"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: "rotate(180deg)" }}><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <span className="mono origin-center -rotate-90 whitespace-nowrap text-[9px] text-muted" style={{ marginTop: 8 }}>Projects</span>
          </div>
        )}
        <aside className={`${sidebarOpen ? "flex" : "hidden"} w-[300px] flex-none flex-col border-r border-border bg-surface/40`}>
          <div className="border-b border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="mono text-muted">Projects</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleSidebar}
                  title="Ẩn cột Projects"
                  className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted transition hover:border-accent hover:text-accent-soft"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" /></svg>
                </button>
                {(() => {
                  const allCollapsed = props.projects.length > 0 && props.projects.every((p) => collapsedProjects.has(p.id));
                  return (
                    <button
                      onClick={() => setCollapsedProjects(allCollapsed ? new Set() : new Set(props.projects.map((p) => p.id)))}
                      title={allCollapsed ? "Mở rộng tất cả" : "Thu gọn tất cả"}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted transition hover:border-accent hover:text-accent-soft"
                    >
                      {allCollapsed ? (
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9h16M4 15h16" /></svg>
                      )}
                    </button>
                  );
                })()}
                <button
                  onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
                  title={view === "grid" ? "Xem dạng danh sách" : "Xem dạng thumbnail"}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted transition hover:border-accent hover:text-accent-soft"
                >
                  {view === "grid" ? (
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                  )}
                </button>
              </div>
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
                      <input ref={audioRef} type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac" multiple hidden onChange={(e) => { uploadAudio(e.target.files); e.currentTarget.value = ""; }} />

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
                        <div
                          onDragOver={(e) => { if (props.activeProjectId && Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setAssetsDropOver(true); } }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAssetsDropOver(false); }}
                          onDrop={(e) => { setAssetsDropOver(false); if (e.dataTransfer.files?.length) { e.preventDefault(); e.stopPropagation(); uploadImages(e.dataTransfer.files); } }}
                          className={`mt-2 rounded-lg border-t pt-2 transition ${assetsDropOver ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border"}`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <button
                              onClick={() => setAssetsSectionCollapsed((v) => !v)}
                              className="flex items-center gap-1 text-xs text-muted hover:text-white"
                            >
                              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: assetsSectionCollapsed ? "none" : "rotate(90deg)", transition: "transform 0.15s" }}><path d="M9 6l6 6-6 6" /></svg>
                              Assets nguồn
                            </button>
                            <div className="flex items-center gap-1">
                              <button onClick={() => imgRef.current?.click()} className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent-soft">
                                + Ảnh
                              </button>
                              <button onClick={importFromGoogleDrive} className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent-soft">
                                + Drive
                              </button>
                              <button onClick={toggleSort} title={sortDir === "newest" ? "Sắp xếp: mới nhất trước" : "Sắp xếp: cũ nhất trước"} className="rounded-lg border border-border px-1.5 py-1 text-muted hover:border-accent hover:text-accent-soft">
                                {sortDir === "newest" ? (
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                                )}
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
                              {selectedAssets.size > 0 && (
                                <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent/45 bg-accent/10 px-2.5 py-1.5">
                                  <span className="mono text-[11px] font-semibold text-accent-soft">{selectedAssets.size} đã chọn</span>
                                  <div className="flex-1" />
                                  <button onClick={deleteSelectedAssets} className="rounded-md border border-bad/50 bg-bad/10 px-2 py-1 text-[10.5px] font-medium text-bad transition hover:bg-bad/20">🗑 Xoá</button>
                                  <button onClick={() => setSelectedAssets(new Set())} className="rounded-md border border-border px-2 py-1 text-[10.5px] text-muted transition hover:text-white">Bỏ chọn</button>
                                </div>
                              )}
                              {view === "grid" ? (
                                <div className="grid grid-cols-3 gap-1.5">
                                  {imageAssets.map((a) => (
                                    <div key={a.id} draggable onClick={(e) => handleAssetClick(e, a.id)} onDragStart={(e) => handleAssetDragStart(e, a.id)} className={`group/img relative cursor-grab rounded-lg ${selectedAssets.has(a.id) ? "ring-2 ring-accent" : ""}`}>
                                      <img src={assetUrl(a.id)} alt={a.filename} title={a.filename} draggable={false} className={`aspect-[3/4] w-full rounded-lg border object-cover transition hover:-translate-y-0.5 hover:border-accent ${selectedAssets.has(a.id) ? "border-accent" : "border-border"}`} />
                                      <span title={a.filename} className="mt-0.5 block truncate text-center text-[10px] text-muted">{a.filename}</span>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); deleteImage(a.id, a.filename); }}
                                        title="Xoá ảnh khỏi workspace"
                                        className="absolute right-1 top-1 hidden h-5 w-5 place-items-center rounded-full bg-black/70 text-bad transition hover:bg-bad hover:text-white group-hover/img:grid"
                                      >
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {imageAssets.map((a) => (
                                    <div key={a.id} className={`group/img flex items-center gap-2 rounded-lg border p-1.5 hover:border-accent ${selectedAssets.has(a.id) ? "border-accent ring-1 ring-accent" : "border-border"}`}>
                                      <div draggable onClick={(e) => handleAssetClick(e, a.id)} onDragStart={(e) => handleAssetDragStart(e, a.id)} className="flex min-w-0 flex-1 cursor-grab items-center gap-2">
                                        <img src={assetUrl(a.id)} alt="" className="h-8 w-6 flex-none rounded object-cover" />
                                        <span className="truncate text-xs text-white">{a.filename}</span>
                                      </div>
                                      <button
                                        onClick={() => deleteImage(a.id, a.filename)}
                                        title="Xoá ảnh khỏi workspace"
                                        className="hidden h-6 w-6 flex-none place-items-center rounded text-muted transition hover:text-bad group-hover/img:grid"
                                      >
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                      </button>
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
                                    <div key={a.id} className="group/vid flex items-center gap-1 rounded-lg border border-border p-1 hover:border-accent-soft">
                                      <div draggable onDragStart={(e) => e.dataTransfer.setData("text/asset", a.id)} className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5">
                                        <span className="grid h-6 w-6 flex-none place-items-center rounded bg-white/5 text-accent-soft">
                                          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
                                        </span>
                                        <span className="truncate text-xs text-white">{a.filename}</span>
                                      </div>
                                      <button
                                        onClick={() => setTrimModal({ assetId: a.id, filename: a.filename })}
                                        className="hidden h-6 w-6 flex-none items-center justify-center rounded text-muted hover:text-accent-soft group-hover/vid:flex"
                                        title="Cắt video"
                                      >
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></svg>
                                      </button>
                                    </div>
                                  ))}
                                  {videoAssets.length === 0 && <p className="text-center text-[11px] text-muted">Chưa có video.</p>}
                                </div>
                              </div>

                              <div className="mt-2 border-t border-border pt-2">
                                <div className="mb-1.5 flex items-center justify-between">
                                  <span className="mono text-[10px] text-muted">Audio Avatar</span>
                                  <button onClick={() => audioRef.current?.click()} className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent-soft">
                                    + Audio
                                  </button>
                                </div>
                                <div className="flex flex-col gap-1">
                                  {audioAssets.map((a) => (
                                    <div key={a.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/asset", a.id)} className="flex cursor-grab items-center gap-1.5 rounded-lg border border-border p-1.5 hover:border-yellow/70">
                                      <span className="grid h-6 w-6 flex-none place-items-center rounded bg-white/5 text-yellow">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                      </span>
                                      <span className="truncate text-xs text-white">{a.filename}</span>
                                    </div>
                                  ))}
                                  {audioAssets.length === 0 && <p className="text-center text-[11px] text-muted">Chưa có audio.</p>}
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
            <button onClick={openNewProject} className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/45 bg-gradient-to-b from-white/[0.05] to-transparent py-3 text-sm font-semibold text-accent-soft transition hover:border-accent hover:bg-accent/10">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
              New Project
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onDragOverCapture={(e) => { if (active && props.activeBatchId && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault(); }}
          onDropCapture={(e) => { if (active && props.activeBatchId && e.dataTransfer.files?.length) { e.preventDefault(); e.stopPropagation(); uploadImagesToWorkspace(e.dataTransfer.files); } }}
        >
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
                  onClick={toggleSort}
                  title={sortDir === "custom" ? "Đang sắp xếp: tuỳ chỉnh (kéo ⠿) — bấm để về Mới nhất" : sortDir === "newest" ? "Đang sắp xếp: mới nhất trước — bấm để đảo" : "Đang sắp xếp: cũ nhất trước — bấm để đảo"}
                  className={`rounded-full border px-3 py-2 text-sm transition ${sortDir === "custom" ? "border-accent/50 text-accent-soft" : "border-border text-muted hover:border-accent hover:text-white"}`}
                >
                  {sortDir === "custom" ? "⠿ Tuỳ chỉnh" : sortDir === "newest" ? "↓ Mới nhất" : "↑ Cũ nhất"}
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
            onDrop={(e) => { setImgOver(false); if (e.dataTransfer.files?.length) { e.preventDefault(); uploadImagesToWorkspace(e.dataTransfer.files); return; } const multi = e.dataTransfer.getData("text/asset-multi"); if (multi) { e.preventDefault(); try { handleCanvasDropMulti(JSON.parse(multi) as string[]); } catch {} return; } const id = e.dataTransfer.getData("text/asset"); if (id) { e.preventDefault(); handleCanvasDrop(id); } }}
            className="min-h-0 flex-1 overflow-y-auto px-7 pb-10"
          >
            {!props.workspaceHasKlingKey && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                <span>
                  Workspace này chưa được gán API key Kling riêng.
                  {props.userRole === "super_admin"
                    ? <> Bấm avatar góc phải → <b>Settings</b> → <b>API</b> để gán khoá.</>
                    : <> Nhờ Super Admin gán API key cho workspace này.</>}
                </span>
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

            {props.cells.length > 0 && (() => {
              const hasSel = selectedCells.size > 0;
              return (
              <div className={`sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur-sm ${hasSel ? "border-accent/45" : "border-border"}`}>
                <span className={`mono text-sm font-semibold ${hasSel ? "text-accent-soft" : "text-muted"}`}>{hasSel ? `${selectedCells.size} ô đã chọn` : "Chưa chọn ô nào"}</span>
                <div className="flex-1" />
                <button
                  onClick={() => selectAllCells()}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-white"
                >
                  Chọn tất cả
                </button>
                <button
                  onClick={handleBulkGenerate}
                  disabled={!hasSel}
                  className="rounded-lg bg-gradient-to-b from-[#7fe3a8] to-ok px-3 py-1.5 text-xs font-bold text-[#04241a] hover:brightness-110 disabled:opacity-40"
                >
                  ▶ Generate
                </button>
                <div className={`flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5 ${hasSel ? "" : "opacity-40"}`}>
                  <span className="mono px-1.5 text-[9px] text-muted">Mode:</span>
                  {["std", "pro", "4k"].map((m) => (
                    <button
                      key={m}
                      onClick={() => handleBulkMode(m)}
                      disabled={!hasSel}
                      className="rounded-md px-2 py-1 text-[10.5px] font-semibold text-muted hover:bg-accent/20 hover:text-accent-soft disabled:cursor-not-allowed"
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleBulkDelete}
                  disabled={!hasSel}
                  className="rounded-lg border border-bad/50 px-3 py-1.5 text-xs text-bad hover:border-bad hover:bg-bad/10 disabled:opacity-40"
                >
                  Xoá
                </button>
                <button
                  onClick={deselectAll}
                  disabled={!hasSel}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-white disabled:opacity-40"
                >
                  ✕ Bỏ chọn
                </button>
              </div>
              );
            })()}

            <div className="space-y-3.5">
              {sortedCells.map((c) => {
                const shared = {
                  cell: c,
                  startName: props.assets.find((a) => a.id === c.startAssetId)?.filename ?? "",
                  endName: props.assets.find((a) => a.id === c.endAssetId)?.filename ?? "",
                  collapsed: !!collapsed[c.id],
                  selected: selectedCells.has(c.id),
                  onSelect: () => toggleSelect(c.id),
                  onToggle: () => toggleCollapse(c.id),
                  onGenerate: () => handleGenerate(c),
                  onDel: () => start(() => deleteCellAction(props.workspaceId, c.id)),
                  onConvert: (t: CellTypeTab) => conv(c.id, t),
                  reorderId: c.id,
                  outputCtl,
                };
                const inner =
                  c.type === "motioncontrol" ? (
                    <MotionCell {...shared} imageAssets={imageAssets} videoAssets={videoAssets} libraryVideos={props.libraryVideos} onField={(p) => updMC(c.id, p)} />
                  ) : c.type === "avatar" ? (
                    <AvatarCell {...shared} imageAssets={imageAssets} audioAssets={audioAssets} onField={(p) => updAvatar(c.id, p)} />
                  ) : (
                    <Cell
                      {...shared}
                      onField={(p) => updI2V(c.id, p)}
                      onSetEnd={(assetId) => updI2V(c.id, { endAssetId: assetId })}
                      onSwap={() => start(() => swapFramesAction(props.workspaceId, c.id))}
                    />
                  );
                return (
                  <div
                    key={c.id}
                    onDragOver={(e) => { if (e.dataTransfer.types.includes("text/cell-reorder")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                    onDrop={(e) => {
                      const dragged = e.dataTransfer.getData("text/cell-reorder");
                      if (!dragged || dragged === c.id) return;
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      reorderCells(dragged, c.id, e.clientY - r.top < r.height / 2);
                    }}
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
        <PreviewSidebar
          videos={previewVideos}
          open={previewOpen}
          onToggle={() => setPreviewOpen((v) => !v)}
          previewed={previewedUrls}
          downloaded={downloadedUrls}
          downloading={downloadingUrls}
          scrollTarget={scrollTarget}
          onMarkPlayed={markPreviewed}
          onDownload={downloadOutput}
        />
      </div>

      {/* ── Trim Modal ── */}
      {trimModal && (
        <TrimModal
          assetId={trimModal.assetId}
          filename={trimModal.filename}
          workspaceId={props.workspaceId}
          projectId={props.activeProjectId!}
          batchId={props.activeBatchId ?? undefined}
          onClose={() => setTrimModal(null)}
          onDone={() => { setTrimModal(null); router.refresh(); }}
        />
      )}

      {/* ── New Project Modal ── */}
      {newProjectOpen && (
        <div onClick={() => setNewProjectOpen(false)} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-heading font-semibold text-white">Tạo project mới</h3>
              <button onClick={() => setNewProjectOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-white">✕</button>
            </div>
            <div className="p-5">
              <label className="mono mb-1.5 block text-[10px] text-muted">Tên project</label>
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNewProject(); }}
                placeholder="vd: Brand spring campaign"
                className="w-full rounded-xl border border-border bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-muted focus:border-accent"
              />
              <div className="mt-5 flex justify-end gap-2.5">
                <button onClick={() => setNewProjectOpen(false)} className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-white">Huỷ</button>
                <button
                  onClick={submitNewProject}
                  disabled={!newProjectName.trim() || pending}
                  className="rounded-xl bg-gradient-to-b from-accent-soft to-accent px-5 py-2 text-sm font-semibold text-[#04212c] transition hover:brightness-110 disabled:opacity-50"
                >
                  Tạo project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OutputSlotsPanel({ cell, ctl, name }: { cell: CellView; ctl: OutputCtl; name: string }) {
  return (
    <div className="flex h-[220px] w-44 flex-none flex-col gap-1 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-surface-2 p-2">
      {cell.resultUrls.map((url, i) => {
        const status = cell.slotStatuses[i] ?? (url ? "succeeded" : "idle");
        const light = slotLight(status, Boolean(url));
        const active = isActiveOutputStatus(status);
        const err = cell.slotErrors[i];
        const isDownloaded = Boolean(url) && ctl.downloaded.has(url!);
        const isPreviewed = Boolean(url) && ctl.previewed.has(url!);
        const isDownloading = Boolean(url) && ctl.downloading.has(url!);
        // Color precedence: downloaded (purple) > previewed (blue) > Kling status.
        const cls = isDownloaded
          ? { dot: "bg-violet", border: "border-violet/50", bg: "bg-violet/10", text: "text-violet" }
          : isPreviewed
            ? { dot: "bg-info", border: "border-info/50", bg: "bg-info/10", text: "text-info" }
            : light;
        return (
          <div key={i}>
            {url ? (
              <div className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] ${cls.border} ${cls.bg} ${cls.text}`}>
                <button onClick={() => ctl.scrollTo(`${cell.id}:${i}`)} className="flex min-w-0 flex-1 items-center gap-1.5 hover:opacity-80" title="Cuộn tới video trong Preview">
                  <span className={`h-2 w-2 flex-none rounded-full ${cls.dot}`} style={{ boxShadow: active ? "0 0 8px currentColor" : undefined }} />
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" className="flex-none"><path d="M5 3l14 9-14 9z" /></svg>
                  <span className="truncate">Output {i + 1}</span>
                </button>
                <button
                  onClick={() => ctl.download(cell.id, i, url, name)}
                  disabled={isDownloading}
                  title={isDownloaded ? "Đã tải — tải lại" : "Tải video về máy"}
                  className="flex-none rounded p-0.5 hover:bg-white/15 disabled:opacity-50"
                >
                  {isDownloading ? (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3v12M7 11l5 4 5-4M5 21h14" /></svg>
                  )}
                </button>
              </div>
            ) : (
              <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] ${light.border} ${light.bg} ${light.text}`}>
                <span className={`h-2 w-2 flex-none rounded-full ${light.dot}`} style={{ boxShadow: active ? "0 0 8px currentColor" : undefined }} />
                <span className="truncate">
                  {active ? `${light.label}…` : status === "failed" ? "Lỗi" : `Slot ${i + 1}`}
                </span>
              </div>
            )}
            {status === "failed" && err && (
              <p className="mt-0.5 line-clamp-2 cursor-help text-[9px] text-bad" title={err}>{err}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Image→Video Cell ──────────────────────────────────────────────────────────
function Cell({
  cell, startName, endName, collapsed, selected, onSelect, onToggle, onField, onSetEnd, onSwap, onGenerate, onDel, onConvert, outputCtl, reorderId,
}: {
  cell: CellView;
  startName: string;
  endName: string;
  collapsed: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onField: (patch: Parameters<typeof updateCellAction>[2]) => void;
  onSetEnd: (assetId: string) => void;
  onSwap: () => void;
  onGenerate: () => void;
  onDel: () => void;
  onConvert: (t: CellTypeTab) => void;
  outputCtl: OutputCtl;
  reorderId: string;
}) {
  const [endOver, setEndOver] = useState(false);
  const st = cellStatusMeta(cell);
  const generating = hasActiveSlots(cell);
  const caps = getKlingImageCapabilities(cell.modelName);
  const nativeAudioSupported = canUseKlingNativeAudio(cell.modelName, cell.mode);
  const ratioSupported = caps.supportsVideoRatio;
  const cellMeta = [
    cell.modelName,
    `${cell.duration}s`,
    cell.mode,
    ratioSupported ? cell.videoRatio : null,
    cell.nativeAudio ? "audio" : null,
    cell.multiShot ? "multi-shot" : null,
  ].filter(Boolean).join(" · ");

  if (collapsed) {
    return (
      <div className={`flex items-center gap-3 rounded-xl border bg-surface px-2.5 py-2 transition ${selected ? "border-accent/60 bg-accent/5" : "border-border hover:border-border/80"}`}>
        <CollapseBtn collapsed={collapsed} onToggle={onToggle} />
        <SelCheckbox selected={selected} onSelect={onSelect} />
        {cell.startAssetId ? (
          <img src={assetUrl(cell.startAssetId)} alt="" className="h-12 w-9 flex-none rounded-md border border-border object-cover" />
        ) : (
          <div className="h-12 w-9 flex-none rounded-md border border-dashed border-border" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white">{startName || "(chưa có ảnh)"}</div>
          <div className="mono mt-0.5 flex items-center gap-1 text-[10px] text-muted"><span>{cellMeta}</span><span className="ml-auto text-[9px]">{outputCountText(cell)}</span></div>
        </div>
        <span className={`mono flex-none text-[10.5px] ${st.c}`}>{st.t}</span>
        {cell.status === "succeeded" && cell.resultUrl && (
          <button onClick={(e) => { e.stopPropagation(); outputCtl.scrollTo(`${cell.id}:${cell.resultUrls.lastIndexOf(cell.resultUrl!)}`); }} className="flex-none text-accent-soft hover:text-white" title="Xem trong Preview Sidebar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border bg-surface transition ${selected ? "border-accent/60 bg-accent/5" : "border-border"}`}>
      <CellHeader collapsed={collapsed} selected={selected} onToggle={onToggle} onSelect={onSelect} activeType="image2video" onConvert={onConvert} meta={cellMeta} statusText={st.t} statusClass={st.c} dragId={reorderId} />
      <div className="overflow-x-auto">
      <div className="flex min-w-[1000px] items-stretch p-3">
        {/* frames */}
        <div className="relative flex flex-none items-center gap-1.5">
          {cell.startAssetId ? (
            <div className="flex flex-none flex-col gap-0.5">
              <img src={assetUrl(cell.startAssetId)} alt="start" className="h-[156px] w-[118px] rounded-lg border border-border object-cover" />
              {startName && <span title={startName} className="block w-[118px] truncate text-center text-[10px] text-muted">{startName}</span>}
            </div>
          ) : (
            <div className="flex h-[156px] w-[118px] flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center text-[10px] text-muted">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></svg>
              Kéo ảnh vào
            </div>
          )}
          {cell.endAssetId ? (
            <div className="flex flex-none flex-col gap-0.5">
              <img src={assetUrl(cell.endAssetId)} alt="end" className="h-[156px] w-[118px] rounded-lg border border-border object-cover" />
              {endName && <span title={endName} className="block w-[118px] truncate text-center text-[10px] text-muted">{endName}</span>}
            </div>
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
          <div className="flex flex-wrap items-end gap-x-3 gap-y-3 rounded-xl border border-border/70 bg-surface-2/40 p-3">
            <Field label="Model">
              <select defaultValue={cell.modelName} onChange={(e) => onField({ modelName: e.target.value })} className="kf-select">
                {KLING_I2V_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Độ dài">
              <select defaultValue={cell.duration} onChange={(e) => onField({ duration: e.target.value })} className="kf-select">
                {caps.durations.map((d) => <option key={d} value={d}>{d} giây</option>)}
              </select>
            </Field>
            <Field label="Quality">
              <SegmentedGroup>
                {KLING_IMAGE_MODE_OPTIONS.map((m) => (
                  <SegmentedButton
                    key={m.value}
                    active={cell.mode === m.value}
                    disabled={!caps.modes.includes(m.value)}
                    title={caps.modes.includes(m.value) ? m.label : "Model này không support mode này"}
                    onClick={() => onField({ mode: m.value })}
                  >
                    {m.value === "std" ? "Std" : m.value === "pro" ? "Pro" : "4K"}
                  </SegmentedButton>
                ))}
              </SegmentedGroup>
            </Field>
            <Field label="Video Ratio">
              <SegmentedGroup>
                {KLING_VIDEO_RATIO_OPTIONS.map((r) => (
                  <SegmentedButton
                    key={r.value}
                    active={cell.videoRatio === r.value}
                    disabled={!ratioSupported}
                    title={ratioSupported ? `${r.label} output` : "Model này không support chọn ratio"}
                    onClick={() => onField({ videoRatio: r.value })}
                  >
                    {r.label}
                  </SegmentedButton>
                ))}
              </SegmentedGroup>
            </Field>
            <FeatureToggle
              label="Native Audio"
              active={cell.nativeAudio && nativeAudioSupported}
              disabled={!nativeAudioSupported}
              title={nativeAudioSupported ? "Bật native audio" : "Native Audio chỉ support với model/mode phù hợp"}
              onClick={() => onField({ nativeAudio: !cell.nativeAudio })}
            />
            <FeatureToggle
              label="Multi-shot"
              active={cell.multiShot && caps.supportsMultiShot}
              disabled={!caps.supportsMultiShot}
              title={caps.supportsMultiShot ? "Bật multi-shot intelligence" : "Model này không support Multi-shot"}
              onClick={() => onField({ multiShot: !cell.multiShot })}
            />
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
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-bold shadow-[0_6px_20px_-8px_rgba(95,208,142,.55)] hover:brightness-110 ${
              generating
                ? "bg-gradient-to-b from-[#f6ec8a] to-yellow text-[#2c2700]"
                : "bg-gradient-to-b from-[#7fe3a8] to-ok text-[#04241a]"
            }`}
          >
            {activeSlotText(cell)}
          </button>
          <button onClick={onDel} className="rounded-lg border border-bad/50 bg-bad/10 px-1.5 py-2 text-[10.5px] font-semibold text-bad transition hover:border-bad hover:bg-bad/20">Xoá ô</button>
        </div>

        {/* result slots */}
        <OutputSlotsPanel cell={cell} ctl={outputCtl} name={startName} />
      </div>
      </div>
    </div>
  );
}

// ── Motion Control Cell ───────────────────────────────────────────────────────
function MotionCell({
  cell, startName, imageAssets, videoAssets, libraryVideos, collapsed, selected, onSelect, onToggle, onField, onGenerate, onDel, onConvert, outputCtl, reorderId,
}: {
  cell: CellView;
  startName: string;
  imageAssets: AssetView[];
  videoAssets: AssetView[];
  libraryVideos: { id: string; name: string; filename: string }[];
  collapsed: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onField: (patch: Parameters<typeof updateMotionCellAction>[2]) => void;
  onGenerate: () => void;
  onDel: () => void;
  onConvert: (t: CellTypeTab) => void;
  outputCtl: OutputCtl;
  reorderId: string;
}) {
  const [imgDropOver, setImgDropOver] = useState(false);
  const [vidDropOver, setVidDropOver] = useState(false);
  const [videoSourceMode, setVideoSourceMode] = useState<"asset" | "library">(
    cell.libraryVideoId ? "library" : "asset",
  );
  const st = cellStatusMeta(cell);
  const generating = hasActiveSlots(cell);
  const missingImage = !cell.startAssetId;
  const missingVideo = !cell.videoAssetId && !cell.libraryVideoId;
  const canGenerate = !missingImage && !missingVideo;
  const motionMeta = [
    cell.modelName,
    cell.mode === "pro" ? "1080p" : "720p",
    cell.characterOrientation === "video" ? "orient video <=30s" : "orient image <=10s",
    cell.keepOriginalSound === "yes" ? "keep sound" : "silent",
  ].join(" · ");

  useEffect(() => {
    if (cell.libraryVideoId) setVideoSourceMode("library");
    else if (cell.videoAssetId) setVideoSourceMode("asset");
  }, [cell.libraryVideoId, cell.videoAssetId]);

  if (collapsed) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border bg-surface px-2.5 py-2 transition"
        style={selected
          ? { borderColor: "rgb(var(--color-accent)/0.6)", background: "rgb(var(--color-accent)/0.08)" }
          : { borderColor: "rgb(var(--color-accent)/0.35)", background: "rgb(var(--color-accent)/0.04)" }}
      >
        <CollapseBtn collapsed={collapsed} onToggle={onToggle} />
        <SelCheckbox selected={selected} onSelect={onSelect} />
        {cell.startAssetId ? (
          <img src={assetUrl(cell.startAssetId)} alt="" className="h-12 w-9 flex-none rounded-md border border-border object-cover" />
        ) : (
          <div className="h-12 w-9 flex-none rounded-md border border-dashed border-border" />
        )}
        <span className="mono flex-none rounded-md bg-accent/15 px-1.5 py-0.5 text-[9px] text-accent-soft">Motion Control</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white">{startName || "(chưa có ảnh)"}</div>
          <div className="mono mt-0.5 flex items-center gap-1 text-[10px] text-muted">
            <span>
              {motionMeta} · {cell.libraryVideoId ? "Template library" : cell.videoAssetId ? "Video upload" : "Chưa chọn video"}
            </span>
            <span className="ml-auto text-[9px]">{outputCountText(cell)}</span>
          </div>
        </div>
        <span className={`mono flex-none text-[10.5px] ${st.c}`}>{st.t}</span>
        {cell.status === "succeeded" && cell.resultUrl && (
          <button onClick={(e) => { e.stopPropagation(); outputCtl.scrollTo(`${cell.id}:${cell.resultUrls.lastIndexOf(cell.resultUrl!)}`); }} className="flex-none text-accent-soft hover:text-white" title="Xem trong Preview Sidebar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border bg-surface transition"
      style={selected
        ? { borderColor: "rgb(var(--color-accent)/0.6)", background: "linear-gradient(135deg,rgb(var(--color-accent)/0.1),transparent)" }
        : { borderColor: "rgb(var(--color-accent)/0.3)", background: "linear-gradient(135deg,rgb(var(--color-accent)/0.06),transparent)" }}
    >
      <CellHeader collapsed={collapsed} selected={selected} onToggle={onToggle} onSelect={onSelect} activeType="motioncontrol" onConvert={onConvert} meta={motionMeta} statusText={st.t} statusClass={st.c} dragId={reorderId} />
      <div className="overflow-x-auto">
      <div className="flex min-w-[1000px] items-stretch p-3">
        {/* ref image + video section */}
        <div className="flex flex-none items-start gap-3">
          {/* Ảnh tham chiếu */}
          <div className="flex flex-col gap-1.5">
            <span className="mono text-[9px] text-accent-soft">Ảnh tham chiếu</span>
            <div
              onDragOver={(e) => { e.preventDefault(); setImgDropOver(true); }}
              onDragLeave={() => setImgDropOver(false)}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation(); setImgDropOver(false);
                const id = e.dataTransfer.getData("text/asset");
                if (id && imageAssets.some((a) => a.id === id)) onField({ imageAssetId: id });
              }}
              className={`h-[160px] w-[100px] overflow-hidden rounded-lg border border-dashed ${imgDropOver ? "border-accent bg-accent/10" : "border-border"}`}
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
            {cell.startAssetId && startName && <span title={startName} className="block w-[100px] truncate text-center text-[10px] text-muted">{startName}</span>}
          </div>

          {/* Video chuyển động — 2 modes: project-uploaded asset OR library template */}
          <div className="flex w-[220px] flex-col gap-1.5">
            <span className="mono text-[9px] text-accent-soft">Video chuyển động</span>

            <div className="grid grid-cols-2 rounded-lg border border-border bg-surface-2 p-0.5 text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => {
                  setVideoSourceMode("asset");
                  if (cell.libraryVideoId) onField({ libraryVideoId: null });
                }}
                className={`rounded-md px-2 py-1.5 transition ${videoSourceMode === "asset" ? "bg-accent/20 text-accent-soft" : "text-muted hover:text-white"}`}
              >
                Upload video
              </button>
              <button
                type="button"
                onClick={() => {
                  setVideoSourceMode("library");
                  if (cell.videoAssetId) onField({ videoAssetId: null });
                }}
                className={`rounded-md px-2 py-1.5 transition ${videoSourceMode === "library" ? "bg-accent/20 text-accent-soft" : "text-muted hover:text-white"}`}
              >
                Template
              </button>
            </div>

            {videoSourceMode === "library" ? (
              libraryVideos.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-1" style={{ maxHeight: 136, overflowY: "auto" }}>
                    {libraryVideos.map((v) => {
                      const isSelected = cell.libraryVideoId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => onField({ libraryVideoId: isSelected ? null : v.id, videoAssetId: null })}
                          title={v.name}
                          className={`relative overflow-hidden rounded border transition ${isSelected ? "border-accent ring-1 ring-accent/60" : "border-border hover:border-accent/50"}`}
                          style={{ aspectRatio: "16/9" }}
                        >
                          <video src={`/api/library/${v.id}`} muted preload="metadata" className="h-full w-full object-cover bg-black" />
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-accent/40">
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-px text-[7px] leading-tight text-white">{v.name}</div>
                        </button>
                      );
                    })}
                  </div>
                  {cell.libraryVideoId && (
                    <p className="mono truncate text-[9px] text-accent-soft">
                      ✓ Template: {libraryVideos.find((v) => v.id === cell.libraryVideoId)?.name}
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-[10px] italic text-muted">
                  Thư viện trống. Super Admin upload template trong Settings.
                </p>
              )
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setVidDropOver(true); }}
                onDragLeave={() => setVidDropOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation(); setVidDropOver(false);
                  const id = e.dataTransfer.getData("text/asset");
                  if (id && videoAssets.some((a) => a.id === id)) onField({ videoAssetId: id, libraryVideoId: null });
                }}
                className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-2 text-center text-[10px] transition ${vidDropOver ? "border-accent bg-accent/10 text-accent-soft" : cell.videoAssetId ? "border-accent/50 bg-accent/5 text-accent-soft" : "border-border text-muted"}`}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" className="opacity-60"><path d="M5 3l14 9-14 9z" /></svg>
                <span className="max-w-full truncate">
                  {cell.videoAssetId
                    ? videoAssets.find((a) => a.id === cell.videoAssetId)?.filename ?? "Video input đã chọn"
                    : "Kéo video input đã upload từ sidebar vào đây"}
                </span>
                {cell.videoAssetId && (
                  <button
                    type="button"
                    onClick={() => onField({ videoAssetId: null })}
                    className="text-[9px] text-muted underline hover:text-bad"
                  >
                    Bỏ video
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mx-4 w-px flex-none bg-border" />

        {/* controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-3 rounded-xl border border-border/70 bg-surface-2/40 p-3">
            <Field label="Model">
              <SegmentedGroup>
                {KLING_MOTION_MODELS.map((m) => (
                  <SegmentedButton
                    key={m.value}
                    active={cell.modelName === m.value}
                    title={m.note}
                    onClick={() => onField({ modelName: m.value })}
                  >
                    {m.label.replace("Kling ", "")}
                  </SegmentedButton>
                ))}
              </SegmentedGroup>
            </Field>
            <Field label="Quality">
              <SegmentedGroup>
                {KLING_MOTION_MODE_OPTIONS.map((m) => (
                  <SegmentedButton
                    key={m.value}
                    active={cell.mode === m.value}
                    title={m.note}
                    onClick={() => onField({ mode: m.value })}
                  >
                    {m.value.toUpperCase()}
                  </SegmentedButton>
                ))}
              </SegmentedGroup>
            </Field>
            <Field label="Orientation">
              <SegmentedGroup>
                {KLING_MOTION_ORIENTATION_OPTIONS.map((o) => (
                  <SegmentedButton
                    key={o.value}
                    active={cell.characterOrientation === o.value}
                    title={o.note}
                    onClick={() => onField({ characterOrientation: o.value })}
                  >
                    {o.label}
                  </SegmentedButton>
                ))}
              </SegmentedGroup>
            </Field>
            <Field label="Keep Sound">
              <SegmentedGroup>
                {KLING_SOUND_MODE_OPTIONS.map((s) => (
                  <SegmentedButton
                    key={s.value}
                    active={cell.keepOriginalSound === s.value}
                    title={s.value === "yes" ? "Giữ âm thanh gốc của motion video" : "Tạo video im lặng"}
                    onClick={() => onField({ keepOriginalSound: s.value })}
                  >
                    {s.value === "yes" ? "On" : "Off"}
                  </SegmentedButton>
                ))}
              </SegmentedGroup>
            </Field>
          </div>
          <textarea
            defaultValue={cell.prompt}
            onBlur={(e) => { if (e.target.value !== cell.prompt) onField({ prompt: e.target.value }); }}
            placeholder="Prompt bổ sung (tuỳ chọn)…"
            className="min-h-[54px] flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {cell.status === "failed" && cell.error && <p className="text-xs text-bad">{cell.error}</p>}
          <div className="flex flex-wrap gap-1">
            <span className="mono rounded-md bg-accent/10 px-2 py-1 text-[10px] text-accent-soft">
              {cell.modelName === "kling-v3" ? "Motion Control 3.0" : "Motion Control 2.6"}
            </span>
            <span className="mono rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted">
              {cell.characterOrientation === "video" ? "Reference video <=30s" : "Reference video <=10s"}
            </span>
            {cell.modelName === "kling-v3" && (
              <span className="mono rounded-md bg-yellow/10 px-2 py-1 text-[10px] text-yellow/80">4K không support Motion Control</span>
            )}
          </div>
        </div>

        {/* actions */}
        <div className="mx-4 flex w-[134px] flex-none flex-col gap-3.5">
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-bold shadow-[0_6px_20px_-8px_rgba(95,208,142,.55)] ${
              !canGenerate
                ? "cursor-not-allowed bg-surface-2 text-muted"
                : generating
                  ? "bg-gradient-to-b from-[#f6ec8a] to-yellow text-[#2c2700] hover:brightness-110"
                  : "bg-gradient-to-b from-[#7fe3a8] to-ok text-[#04241a] hover:brightness-110"
            }`}
          >
            {!canGenerate ? (missingImage ? "Cần ảnh" : "Cần video") : activeSlotText(cell)}
          </button>
          <button onClick={onDel} className="rounded-lg border border-bad/50 bg-bad/10 px-1.5 py-2 text-[10.5px] font-semibold text-bad transition hover:border-bad hover:bg-bad/20">Xoá ô</button>
        </div>

        {/* result slots */}
        <OutputSlotsPanel cell={cell} ctl={outputCtl} name={startName} />
      </div>
      </div>
    </div>
  );
}

// ── Avatar Cell ───────────────────────────────────────────────────────────────
function AvatarCell({
  cell, startName, imageAssets, audioAssets, collapsed, selected, onSelect, onToggle, onField, onGenerate, onDel, onConvert, outputCtl, reorderId,
}: {
  cell: CellView;
  startName: string;
  imageAssets: AssetView[];
  audioAssets: AssetView[];
  collapsed: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onField: (patch: Parameters<typeof updateAvatarCellAction>[2]) => void;
  onGenerate: () => void;
  onDel: () => void;
  onConvert: (t: CellTypeTab) => void;
  outputCtl: OutputCtl;
  reorderId: string;
}) {
  const [imgDropOver, setImgDropOver] = useState(false);
  const [audioDropOver, setAudioDropOver] = useState(false);
  const [audioSourceMode, setAudioSourceMode] = useState<"asset" | "audio_id" | "url">(
    cell.avatarAudioAssetId ? "asset" : cell.avatarAudioId ? "audio_id" : "url",
  );
  const st = cellStatusMeta(cell);
  const generating = hasActiveSlots(cell);
  const avatarPrompt = cell.prompt || cell.avatarText;
  const hasAudio = Boolean(cell.avatarAudioAssetId || cell.avatarAudioId.trim() || cell.avatarSoundUrl.trim());
  const canGenerate = Boolean(cell.startAssetId && hasAudio);
  const audioLabel = cell.avatarAudioAssetId
    ? audioAssets.find((a) => a.id === cell.avatarAudioAssetId)?.filename ?? "Audio asset"
    : cell.avatarAudioId
      ? `audio_id: ${cell.avatarAudioId}`
      : cell.avatarSoundUrl
        ? "Audio URL"
        : "Chưa có audio";

  useEffect(() => {
    if (cell.avatarAudioAssetId) setAudioSourceMode("asset");
    else if (cell.avatarAudioId) setAudioSourceMode("audio_id");
    else if (cell.avatarSoundUrl) setAudioSourceMode("url");
  }, [cell.avatarAudioAssetId, cell.avatarAudioId, cell.avatarSoundUrl]);

  if (collapsed) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border bg-surface px-2.5 py-2 transition"
        style={selected
          ? { borderColor: "rgb(var(--color-yellow)/0.6)", background: "rgb(var(--color-yellow)/0.08)" }
          : { borderColor: "rgb(var(--color-yellow)/0.35)", background: "rgb(var(--color-yellow)/0.04)" }}
      >
        <CollapseBtn collapsed={collapsed} onToggle={onToggle} />
        <SelCheckbox selected={selected} onSelect={onSelect} />
        {cell.startAssetId ? (
          <img src={assetUrl(cell.startAssetId)} alt="" className="h-12 w-9 flex-none rounded-md border border-yellow/30 object-cover" />
        ) : (
          <span className="grid h-12 w-9 flex-none place-items-center rounded-md border border-dashed border-yellow/40 text-yellow/60">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
          </span>
        )}
        <span className="mono flex-none rounded-md bg-yellow/15 px-1.5 py-0.5 text-[9px] text-yellow">Avatar</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white">{startName || avatarPrompt || "(chưa có ảnh)"}</div>
          <div className="mono mt-0.5 flex items-center gap-1 text-[10px] text-muted"><span>{cell.mode} · {audioLabel}</span><span className="ml-auto text-[9px]">{outputCountText(cell)}</span></div>
        </div>
        <span className={`mono flex-none text-[10.5px] ${st.c}`}>{st.t}</span>
        {cell.status === "succeeded" && cell.resultUrl && (
          <button onClick={(e) => { e.stopPropagation(); outputCtl.scrollTo(`${cell.id}:${cell.resultUrls.lastIndexOf(cell.resultUrl!)}`); }} className="flex-none text-accent-soft hover:text-white" title="Xem trong Preview Sidebar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border bg-surface transition"
      style={selected
        ? { borderColor: "rgb(var(--color-yellow)/0.6)", background: "linear-gradient(135deg,rgb(var(--color-yellow)/0.08),transparent)" }
        : { borderColor: "rgb(var(--color-yellow)/0.3)", background: "linear-gradient(135deg,rgb(var(--color-yellow)/0.05),transparent)" }}
    >
      <CellHeader collapsed={collapsed} selected={selected} onToggle={onToggle} onSelect={onSelect} activeType="avatar" onConvert={onConvert} meta={`${cell.mode} · ${audioLabel}`} statusText={st.t} statusClass={st.c} dragId={reorderId} />
      <div className="overflow-x-auto">
      <div className="flex min-w-[1000px] items-stretch p-3">
        <div className="flex flex-none items-start gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="mono text-[9px] text-yellow">Ảnh Avatar</span>
            <div
              onDragOver={(e) => { e.preventDefault(); setImgDropOver(true); }}
              onDragLeave={() => setImgDropOver(false)}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation(); setImgDropOver(false);
                const id = e.dataTransfer.getData("text/asset");
                if (id && imageAssets.some((a) => a.id === id)) onField({ imageAssetId: id });
              }}
              className={`h-[156px] w-[112px] overflow-hidden rounded-lg border border-dashed ${imgDropOver ? "border-yellow bg-yellow/10" : "border-yellow/35"}`}
            >
              {cell.startAssetId ? (
                <img src={assetUrl(cell.startAssetId)} alt="avatar ref" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-[10px] text-yellow/60">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="8" r="4.5" /><path d="M3 21c0-5 4-8.5 9-8.5s9 3.5 9 8.5" /></svg>
                  Kéo ảnh vào
                </div>
              )}
            </div>
            {cell.startAssetId && startName && <span title={startName} className="block w-[112px] truncate text-center text-[10px] text-muted">{startName}</span>}
          </div>

          <div className="flex w-[260px] flex-col gap-1.5">
            <span className="mono text-[9px] text-yellow">Audio</span>
            <div className="grid grid-cols-3 rounded-lg border border-border bg-surface-2 p-0.5 text-[10px] font-semibold">
              {[
                ["asset", "Upload"],
                ["audio_id", "Audio ID"],
                ["url", "URL"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAudioSourceMode(id as "asset" | "audio_id" | "url")}
                  className={`rounded-md px-2 py-1.5 transition ${audioSourceMode === id ? "bg-yellow/20 text-yellow" : "text-muted hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {audioSourceMode === "asset" ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setAudioDropOver(true); }}
                onDragLeave={() => setAudioDropOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation(); setAudioDropOver(false);
                  const id = e.dataTransfer.getData("text/asset");
                  if (id && audioAssets.some((a) => a.id === id)) onField({ avatarAudioAssetId: id });
                }}
                className={`flex min-h-[86px] flex-col justify-center gap-1 rounded-lg border border-dashed px-2 py-2 text-[10px] transition ${audioDropOver ? "border-yellow bg-yellow/10 text-yellow" : cell.avatarAudioAssetId ? "border-yellow/50 bg-yellow/5 text-yellow" : "border-border text-muted"}`}
              >
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                  <span className="truncate">{cell.avatarAudioAssetId ? audioLabel : "Kéo audio từ sidebar vào đây"}</span>
                </div>
                {cell.avatarAudioAssetId && (
                  <audio src={assetUrl(cell.avatarAudioAssetId)} controls className="h-7 w-full" />
                )}
              </div>
            ) : audioSourceMode === "audio_id" ? (
              <input
                defaultValue={cell.avatarAudioId}
                onBlur={(e) => { if (e.target.value !== cell.avatarAudioId) onField({ avatarAudioId: e.target.value }); }}
                placeholder="audio_id từ Kling TTS"
                className="kf-select w-full font-mono text-[11px]"
              />
            ) : (
              <input
                defaultValue={cell.avatarSoundUrl}
                onBlur={(e) => { if (e.target.value !== cell.avatarSoundUrl) onField({ avatarSoundUrl: e.target.value }); }}
                placeholder="https://.../voice.mp3"
                className="kf-select w-full font-mono text-[11px]"
              />
            )}
          </div>
        </div>

        <div className="mx-4 w-px flex-none bg-border" />

        {/* controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-3 rounded-xl border border-border/70 bg-surface-2/40 p-3">
            <Field label="Mode">
              <SegmentedGroup>
                {KLING_AVATAR_MODE_OPTIONS.map((m) => (
                  <SegmentedButton
                    key={m.value}
                    active={cell.mode === m.value}
                    title={m.note}
                    onClick={() => onField({ mode: m.value as KlingMotionMode })}
                  >
                    {m.value.toUpperCase()}
                  </SegmentedButton>
                ))}
              </SegmentedGroup>
            </Field>
            <span className="mono rounded-md bg-yellow/10 px-2 py-1 text-[10px] text-yellow/80">Avatar image2video</span>
            <span className="mono rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted">Audio 2-300s · image 1:2.5~2.5:1</span>
          </div>
          <textarea
            defaultValue={avatarPrompt}
            onBlur={(e) => { if (e.target.value !== avatarPrompt) onField({ prompt: e.target.value, avatarText: e.target.value }); }}
            placeholder="Prompt biểu cảm, hành động, camera movement…"
            className="min-h-[64px] flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {cell.status === "failed" && cell.error && <p className="text-xs text-bad">{cell.error}</p>}
          {(!cell.startAssetId || !hasAudio) && (
            <p className="text-[10px] text-yellow/70">Cần chọn ảnh Avatar và audio_id/sound_file để generate.</p>
          )}
        </div>

        {/* actions */}
        <div className="mx-4 flex w-[134px] flex-none flex-col gap-3.5">
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-bold shadow-[0_6px_20px_-8px_rgba(95,208,142,.55)] ${
              !canGenerate
                ? "cursor-not-allowed bg-surface-2 text-muted"
                : generating
                  ? "bg-gradient-to-b from-[#f6ec8a] to-yellow text-[#2c2700] hover:brightness-110"
                  : "bg-gradient-to-b from-[#7fe3a8] to-ok text-[#04241a] hover:brightness-110"
            }`}
          >
            {!canGenerate ? "Thiếu thông tin" : activeSlotText(cell)}
          </button>
          <button onClick={onDel} className="rounded-lg border border-bad/50 bg-bad/10 px-1.5 py-2 text-[10.5px] font-semibold text-bad transition hover:border-bad hover:bg-bad/20">Xoá ô</button>
        </div>

        {/* result slots */}
        <OutputSlotsPanel cell={cell} ctl={outputCtl} name={startName} />
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

function SegmentedGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 overflow-hidden rounded-lg border border-border bg-surface-2">
      {children}
    </div>
  );
}

function SegmentedButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`min-w-[44px] border-r border-border px-2 text-[11px] font-semibold transition last:border-r-0 ${
        active
          ? "bg-accent text-[#04212c]"
          : disabled
            ? "cursor-not-allowed bg-surface text-muted/35"
            : "text-muted hover:bg-accent/10 hover:text-accent-soft"
      }`}
    >
      {children}
    </button>
  );
}

function FeatureToggle({
  label,
  active,
  disabled,
  title,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`mt-4 h-9 rounded-lg border px-3 text-[11px] font-semibold transition ${
        active
          ? "border-accent bg-accent/15 text-accent-soft"
          : disabled
            ? "cursor-not-allowed border-border bg-surface text-muted/35"
            : "border-border bg-surface-2 text-muted hover:border-accent hover:text-accent-soft"
      }`}
    >
      {label}
    </button>
  );
}

// ── Preview Sidebar ───────────────────────────────────────────────────────────
function PreviewSidebar({
  videos,
  open,
  onToggle,
  previewed,
  downloaded,
  downloading,
  scrollTarget,
  onMarkPlayed,
  onDownload,
}: {
  videos: PreviewVideo[];
  open: boolean;
  onToggle: () => void;
  previewed: Set<string>;
  downloaded: Set<string>;
  downloading: Set<string>;
  scrollTarget: { id: string; nonce: number } | null;
  onMarkPlayed: (url: string) => void;
  onDownload: (jobId: string, slot: number, url: string, name: string) => void;
}) {
  useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(`preview-card-${scrollTarget.id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollTarget]);

  return (
    <div
      className="relative flex flex-none overflow-hidden border-l border-border bg-surface/40 transition-[width] duration-200"
      style={{ width: open ? 420 : 36 }}
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
        {videos.length > 0 && (
          <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-ok px-1 text-[9px] font-bold text-[#04241a]" title={`${videos.length} video output`}>
            {videos.length}
          </span>
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
            <span className="mono text-[11px] font-semibold text-accent-soft">Preview {videos.length > 0 ? `(${videos.length})` : ""}</span>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto p-3">
            {videos.length > 0 ? (
              <div className="space-y-3">
                {videos.map((v) => (
                  <PreviewVideoCard
                    key={v.id}
                    video={v}
                    isPreviewed={previewed.has(v.url)}
                    isDownloaded={downloaded.has(v.url)}
                    isDownloading={downloading.has(v.url)}
                    onPlay={() => onMarkPlayed(v.url)}
                    onDownload={() => onDownload(v.jobId, v.slot, v.url, v.name)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
                <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M10 10l5 3-5 3z" />
                </svg>
                <p className="text-xs leading-relaxed">Các video đã generate xong sẽ tự hiện ở đây.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewVideoCard({
  video,
  isPreviewed,
  isDownloaded,
  isDownloading,
  onPlay,
  onDownload,
}: {
  video: PreviewVideo;
  isPreviewed: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  onPlay: () => void;
  onDownload: () => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const aspectValue = size ? size.width / size.height : 16 / 9;
  const aspectRatio = size ? `${size.width} / ${size.height}` : "16 / 9";
  const maxWidth =
    aspectValue < 0.82
      ? "min(100%, 280px)"
      : aspectValue < 1.08
        ? "min(100%, 340px)"
        : "100%";
  // Border reflects state: downloaded (violet) > previewed (info blue) > default.
  const borderClass = isDownloaded ? "border-violet/60" : isPreviewed ? "border-info/60" : "border-border";

  return (
    <div id={`preview-card-${video.id}`} className={`overflow-hidden rounded-xl border bg-surface-2 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
        <div className="min-w-0">
          <span className="block truncate text-xs font-medium text-white">{video.label}</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            {size && <span className="mono block text-[9px] text-muted">{ratioLabel(size.width, size.height)}</span>}
            {isDownloaded ? (
              <span className="mono text-[9px] text-violet">● Đã tải</span>
            ) : isPreviewed ? (
              <span className="mono text-[9px] text-info">● Đã xem</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          <a href={video.url} target="_blank" rel="noreferrer" className="mono text-[10px] text-muted hover:text-white" title="Mở trong tab mới">
            ↗
          </a>
          <button
            onClick={onDownload}
            disabled={isDownloading}
            title={isDownloaded ? "Đã tải — tải lại" : "Tải video về máy"}
            className={`rounded p-0.5 transition hover:bg-white/15 disabled:opacity-50 ${isDownloaded ? "text-violet" : "text-muted hover:text-white"}`}
          >
            {isDownloading ? (
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3v12M7 11l5 4 5-4M5 21h14" /></svg>
            )}
          </button>
        </div>
      </div>
      <div className="flex justify-center bg-black/40 p-2">
        <div className="w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio, maxWidth }}>
          <video
            src={video.url}
            controls
            preload="metadata"
            onPlay={onPlay}
            onLoadedMetadata={(e) => {
              const { videoWidth, videoHeight } = e.currentTarget;
              if (videoWidth > 0 && videoHeight > 0) setSize({ width: videoWidth, height: videoHeight });
            }}
            className="h-full w-full bg-black object-contain"
          />
        </div>
      </div>
    </div>
  );
}

function ratioLabel(width: number, height: number) {
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

// ── TrimModal ─────────────────────────────────────────────────────────────────
function TrimModal({
  assetId,
  filename,
  workspaceId,
  projectId,
  batchId,
  onClose,
  onDone,
}: {
  assetId: string;
  filename: string;
  workspaceId: string;
  projectId: string;
  batchId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${sec}`;
  }

  function onLoaded() {
    const d = videoRef.current?.duration ?? 0;
    setDuration(d);
    setTrimEnd(d);
  }

  function seek(t: number) {
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  async function handleTrim() {
    if (trimEnd <= trimStart) { setError("Thời điểm kết thúc phải sau thời điểm bắt đầu."); return; }
    if (trimEnd - trimStart < 0.5) { setError("Đoạn cắt tối thiểu 0.5 giây."); return; }
    setBusy(true);
    setError(null);
    try {
      await trimVideoAction(workspaceId, projectId, assetId, trimStart, trimEnd, batchId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
      setBusy(false);
    }
  }

  const pct = (v: number) => duration > 0 ? `${(v / duration) * 100}%` : "0%";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-[560px] max-w-[95vw] flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Cắt video</h2>
            <p className="mt-0.5 truncate text-xs text-muted">{filename}</p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-white">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* video preview */}
        <video
          ref={videoRef}
          src={`/api/assets/${assetId}`}
          onLoadedMetadata={onLoaded}
          controls
          className="w-full rounded-xl bg-black"
          style={{ maxHeight: "240px" }}
        />

        {/* timeline bar */}
        {duration > 0 && (
          <div className="relative h-6 rounded-md bg-white/5">
            <div
              className="absolute inset-y-0 rounded-md bg-accent/30"
              style={{ left: pct(trimStart), right: `calc(100% - ${pct(trimEnd)})` }}
            />
            <div className="absolute inset-y-0 left-0 right-0 flex items-center px-2 text-[10px] text-muted">
              <span className="flex-1">{fmt(trimStart)}</span>
              <span className="text-accent-soft">{fmt(trimEnd - trimStart)} selected</span>
              <span className="flex-1 text-right">{fmt(trimEnd)}</span>
            </div>
          </div>
        )}

        {/* sliders */}
        {duration > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="w-16 flex-none text-right text-xs text-muted">Bắt đầu</span>
              <input
                type="range" min={0} max={duration} step={0.1} value={trimStart}
                onChange={(e) => { const v = Math.min(Number(e.target.value), trimEnd - 0.5); setTrimStart(v); seek(v); }}
                className="flex-1 accent-accent-soft"
              />
              <span className="w-14 flex-none font-mono text-xs text-white">{fmt(trimStart)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 flex-none text-right text-xs text-muted">Kết thúc</span>
              <input
                type="range" min={0} max={duration} step={0.1} value={trimEnd}
                onChange={(e) => { const v = Math.max(Number(e.target.value), trimStart + 0.5); setTrimEnd(v); seek(v); }}
                className="flex-1 accent-accent-soft"
              />
              <span className="w-14 flex-none font-mono text-xs text-white">{fmt(trimEnd)}</span>
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm text-muted hover:text-white">
            Huỷ
          </button>
          <button
            onClick={handleTrim}
            disabled={busy || duration === 0}
            className="rounded-full bg-gradient-to-b from-[#7fe3a8] to-ok px-5 py-2 text-sm font-semibold text-[#04241a] shadow-[0_6px_20px_-6px_rgba(95,208,142,.6)] hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Đang cắt…" : "Cắt & Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
