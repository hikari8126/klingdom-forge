"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@prisma/client";
import {
  uploadImagesAction,
  createProjectAction,
  createCellAction,
  updateCellAction,
  duplicateCellAction,
  deleteCellAction,
  generateCellAction,
  generateAllAction,
  swapFramesAction,
} from "./actions";

export type CellView = {
  id: string;
  status: JobStatus;
  resultUrl: string | null;
  error: string | null;
  startAssetId: string;
  endAssetId: string | null;
  prompt: string;
  modelName: string;
  mode: "std" | "pro";
  duration: "5" | "10";
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  assets: { id: string; filename: string }[];
  cells: CellView[];
};

// model_name values per Kling docs (api-singapore). Add 3.0 Omni/Turbo when confirmed.
const MODELS: { value: string; label: string }[] = [
  { value: "kling-v3", label: "Kling 3.0" },
  { value: "kling-v2-6", label: "Kling 2.6" },
  { value: "kling-v2-5-turbo", label: "Kling 2.5 Turbo" },
  { value: "kling-v2-1", label: "Kling 2.1" },
  { value: "kling-v1-6", label: "Kling 1.6" },
];
const ST: Record<JobStatus, { t: string; c: string }> = {
  draft: { t: "○ Nháp", c: "text-muted" },
  queued: { t: "○ Trong hàng đợi", c: "text-muted" },
  submitted: { t: "● Đã gửi", c: "text-accent-soft" },
  processing: { t: "● Đang tạo…", c: "text-accent-soft" },
  succeeded: { t: "● Xong", c: "text-ok" },
  failed: { t: "● Lỗi", c: "text-bad" },
};
const assetUrl = (id: string) => `/api/assets/${id}`;

export default function Studio(props: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [over, setOver] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // UI prefs persist client-side (survive auto-refresh)
  useEffect(() => {
    try {
      const v = localStorage.getItem("kdf-view");
      if (v === "list" || v === "grid") setView(v);
      const c = localStorage.getItem("kdf-collapsed");
      if (c) setCollapsed(JSON.parse(c));
    } catch {}
  }, []);
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
  const anyActive = props.cells.some(
    (c) => c.status === "queued" || c.status === "submitted" || c.status === "processing",
  );

  // auto-refresh while jobs are in flight
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
  function upload(files: FileList | null) {
    if (!files || !files.length || !props.activeProjectId) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    start(() => uploadImagesAction(props.workspaceId, props.activeProjectId!, fd));
  }
  function createCellFrom(assetId: string) {
    if (!props.activeProjectId) return;
    start(() => createCellAction(props.workspaceId, props.activeProjectId!, assetId));
  }
  const upd = (jobId: string, patch: Parameters<typeof updateCellAction>[2]) =>
    start(() => updateCellAction(props.workspaceId, jobId, patch));

  return (
    <div className="flex h-screen">
      {/* SIDEBAR */}
      <aside className="flex w-[300px] flex-col border-r border-border bg-surface/40">
        <div className="border-b border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[#04212c]">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 15l5 3-5 3z" /></svg>
            </span>
            <div className="text-sm font-semibold">KlingDom Forge</div>
          </div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button onClick={() => router.push("/workspaces")} title="Đổi workspace" className="mono flex min-w-0 items-center gap-1.5 text-muted hover:text-accent-soft">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none"><path d="M15 18l-6-6 6-6" /></svg>
              <span className="truncate">{props.workspaceName}</span>
            </button>
            <button onClick={() => router.push(`/workspaces/${props.workspaceId}`)} title="Thành viên & cài đặt" className="flex-none text-muted hover:text-accent-soft">
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
                    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.currentTarget.value = ""; }} />
                    <div className="mb-2 flex items-center gap-2">
                      <button onClick={() => fileRef.current?.click()} className="flex-1 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted hover:border-accent hover:text-accent-soft">
                        + Thêm ảnh
                      </button>
                      <button onClick={toggleView} title="Đổi cách xem (lưới/list)" className="rounded-lg border border-border px-2 py-2 text-muted hover:border-accent hover:text-accent-soft">
                        {view === "grid" ? (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                        )}
                      </button>
                    </div>
                    {view === "grid" ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {props.assets.map((a) => (
                          <img key={a.id} src={assetUrl(a.id)} alt={a.filename} title={a.filename} draggable onDragStart={(e) => e.dataTransfer.setData("text/asset", a.id)} className="aspect-[3/4] w-full cursor-grab rounded-lg border border-border object-cover transition hover:-translate-y-0.5 hover:border-accent" />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {props.assets.map((a) => (
                          <div key={a.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/asset", a.id)} className="flex cursor-grab items-center gap-2 rounded-lg border border-border p-1.5 hover:border-accent">
                            <img src={assetUrl(a.id)} alt="" className="h-8 w-6 flex-none rounded object-cover" />
                            <span className="truncate text-xs text-white">{a.filename}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {props.assets.length === 0 && <p className="mt-1 text-center text-[11px] text-muted">Chưa có ảnh.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-border p-3">
          <button onClick={newProject} className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 py-3 text-sm font-semibold text-accent-soft hover:bg-accent/20">
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
                className="rounded-full bg-ok px-4 py-2 text-sm font-semibold text-[#04241a] hover:brightness-110"
              >
                ▶ Generate tất cả
              </button>
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => { if (active) { e.preventDefault(); setOver(true); } }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { setOver(false); const id = e.dataTransfer.getData("text/asset"); if (id) { e.preventDefault(); createCellFrom(id); } }}
          className="min-h-0 flex-1 overflow-y-auto px-7 pb-10"
        >
          {!active && <p className="text-muted">Tạo một project ở thanh bên để bắt đầu.</p>}
          {active && props.cells.length === 0 && (
            <div className={`flex h-[70%] min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center ${over ? "border-accent bg-accent/10" : "border-border"}`}>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-accent-soft">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 14l4-4 5 5 3-3 6 6" /><circle cx="8.5" cy="8.5" r="1.6" /></svg>
              </div>
              <h3 className="font-semibold text-white">Vùng làm việc trống</h3>
              <p className="max-w-sm text-sm text-muted">Kéo ảnh từ thanh bên trái thả vào đây — mỗi ảnh tạo một ô. Đặt frame, model, độ dài, mode, prompt rồi Generate.</p>
            </div>
          )}

          <div className="space-y-3.5">
            {props.cells.map((c) => (
              <Cell
                key={c.id}
                cell={c}
                collapsed={!!collapsed[c.id]}
                onToggle={() => toggleCollapse(c.id)}
                onField={(patch) => upd(c.id, patch)}
                onSetEnd={(assetId) => upd(c.id, { endAssetId: assetId })}
                onSwap={() => start(() => swapFramesAction(props.workspaceId, c.id))}
                onGenerate={() => start(() => generateCellAction(props.workspaceId, c.id))}
                onDup={() => start(() => duplicateCellAction(props.workspaceId, c.id))}
                onDel={() => start(() => deleteCellAction(props.workspaceId, c.id))}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

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
                {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Độ dài">
              <select defaultValue={cell.duration} onChange={(e) => onField({ duration: e.target.value as "5" | "10" })} className="kf-select">
                <option value="5">5 giây</option>
                <option value="10">10 giây</option>
              </select>
            </Field>
            <Field label="Mode">
              <select defaultValue={cell.mode} onChange={(e) => onField({ mode: e.target.value as "std" | "pro" })} className="kf-select">
                <option value="std">Standard</option>
                <option value="pro">Professional</option>
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
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-bold ${busy ? "bg-yellow text-[#2c2700]" : "bg-ok text-[#04241a] hover:brightness-110"}`}
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

        {/* video */}
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
