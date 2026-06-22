"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { SettingsData, WorkspaceDetail } from "@/lib/settings-data";
import {
  setUserRoleAction,
  createKlingKeyAction,
  setAccountEnabledAction,
  deleteKlingKeyAction,
  assignKlingKeyAction,
  uploadLibraryVideoAction,
  deleteLibraryVideoAction,
  loadWorkspaceDetailAction,
  createWorkspaceFromSettingsAction,
  renameWorkspaceFromSettingsAction,
  createProjectFromSettingsAction,
  deleteProjectFromSettingsAction,
  addMemberFromSettingsAction,
  removeMemberFromSettingsAction,
} from "@/app/settings-actions";

const THEMES = [
  { id: "teal", label: "Studio Teal", color: "#2A7B9B" },
  { id: "sunset", label: "Sunset", color: "#e85a2e" },
  { id: "grape", label: "Neon Grape", color: "#8b45d4" },
  { id: "slate", label: "Mono Slate", color: "#647890" },
];

export type ModuleId = "role" | "key" | "workspace" | "library" | "appearance";

export function SettingsPanel({
  data,
  initialModule,
  initialWorkspaceId,
  onClose,
  onReload,
}: {
  data: SettingsData;
  initialModule?: ModuleId;
  initialWorkspaceId?: string;
  onClose: () => void;
  onReload: () => void;
}) {
  const isAdmin = data.role === "super_admin";
  const modules: { id: ModuleId; label: string; count?: number }[] = [
    ...(isAdmin
      ? ([
          { id: "role", label: "Role", count: data.users.length },
          { id: "key", label: "Key", count: data.accounts.length },
        ] as const)
      : []),
    ...(data.manageWorkspaces.length > 0
      ? ([{ id: "workspace", label: "Workspace", count: data.manageWorkspaces.length }] as const)
      : []),
    { id: "library", label: "Motion Library", count: data.libraryVideos.length },
    { id: "appearance", label: "Giao diện" },
  ];
  const validInitial = initialModule && modules.some((m) => m.id === initialModule) ? initialModule : modules[0].id;
  const [active, setActive] = useState<ModuleId>(validInitial);
  const [pending, start] = useTransition();
  const libRef = useRef<HTMLInputElement>(null);

  function run(action: (fd: FormData) => Promise<unknown>, fd: FormData, after?: () => void) {
    start(async () => {
      await action(fd);
      onReload();
      after?.();
    });
  }

  const desc: Record<ModuleId, string> = {
    role: "Gán quyền theo email.",
    key: "Thêm nhiều Kling key và gán key cho từng workspace.",
    workspace: "Đổi tên, quản lý project & thành viên của workspace.",
    library: "Video template dùng chung cho Motion Control.",
    appearance: "Chọn theme màu cho toàn bộ ứng dụng.",
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 py-5 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="flex h-[min(760px,92vh)] w-[min(1040px,96vw)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <aside className="flex w-56 flex-none flex-col border-r border-border bg-black/20">
          <div className="border-b border-border px-4 py-4">
            <p className="font-heading text-sm font-semibold text-white">Settings</p>
            <p className="mono mt-1 text-[10px] text-muted">Cài đặt chung</p>
          </div>
          <div className="flex-1 space-y-1 p-2">
            {modules.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(m.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  active === m.id ? "bg-accent/20 text-accent-soft" : "text-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="font-medium">{m.label}</span>
                {typeof m.count === "number" && (
                  <span className="mono rounded-full border border-border px-1.5 py-0.5 text-[9px] text-muted">{m.count}</span>
                )}
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h3 className="font-heading text-base font-semibold text-white">
                {modules.find((m) => m.id === active)?.label}
              </h3>
              <p className="mt-1 text-xs text-muted">{desc[active]}</p>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-white">✕</button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {/* ── ROLE ── */}
            {active === "role" && isAdmin && (
              <div className="space-y-5">
                <form
                  onSubmit={(e) => { e.preventDefault(); run(setUserRoleAction, new FormData(e.currentTarget), () => (e.target as HTMLFormElement).reset()); }}
                  className="grid gap-3 rounded-xl border border-border bg-surface-2 p-4 md:grid-cols-[1fr_160px_auto] md:items-end"
                >
                  <label className="flex flex-col gap-1.5">
                    <span className="mono text-[10px] text-muted">Email</span>
                    <input name="email" type="email" required placeholder="email@crossian.com" className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="mono text-[10px] text-muted">Role</span>
                    <select name="role" defaultValue="member" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:border-accent">
                      <option value="member">member</option>
                      <option value="manager">manager</option>
                      <option value="super_admin">super_admin</option>
                    </select>
                  </label>
                  <button disabled={pending} className="rounded-lg bg-gradient-to-b from-accent-soft to-accent px-4 py-2 text-sm font-semibold text-[#04212c] transition hover:brightness-110 disabled:opacity-50">Gán</button>
                </form>
                <div className="space-y-2">
                  {data.users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm">
                      <span className="text-white">{u.name ?? u.email}<span className="ml-2 text-xs text-muted">{u.email}</span></span>
                      <span className="mono text-accent-soft">{u.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── KEY ── */}
            {active === "key" && isAdmin && (
              <div className="space-y-6">
                <div>
                  <p className="mono mb-2 text-[10px] text-muted">Thêm key</p>
                  <form
                    onSubmit={(e) => { e.preventDefault(); run(createKlingKeyAction, new FormData(e.currentTarget), () => (e.target as HTMLFormElement).reset()); }}
                    className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-2 p-4"
                  >
                    <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: 140 }}>
                      <span className="mono text-[10px] text-muted">Nhãn</span>
                      <input name="label" required placeholder="vd: Key #1" className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent" />
                    </label>
                    <label className="flex flex-[2] flex-col gap-1.5" style={{ minWidth: 200 }}>
                      <span className="mono text-[10px] text-muted">API Key</span>
                      <input name="accessKey" type="password" required placeholder="api-key-kling-…" className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent" />
                    </label>
                    <label className="flex flex-col gap-1.5" style={{ width: 110 }}>
                      <span className="mono text-[10px] text-muted">Max song song</span>
                      <input name="maxConcurrent" type="number" min={1} defaultValue={5} className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent" />
                    </label>
                    <button disabled={pending} className="rounded-lg bg-gradient-to-b from-accent-soft to-accent px-4 py-2 text-sm font-semibold text-[#04212c] transition hover:brightness-110 disabled:opacity-50">+ Thêm</button>
                  </form>
                </div>

                <div>
                  <p className="mono mb-2 text-[10px] text-muted">Key đã thêm</p>
                  <div className="space-y-2">
                    {data.accounts.length === 0 && <p className="text-sm text-muted">Chưa có key nào.</p>}
                    {data.accounts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-4 py-2.5 text-sm">
                        <span className="truncate text-white">{a.label} <span className="mono ml-1 text-[10px] text-muted">×{a.maxConcurrent}</span></span>
                        <div className="flex flex-none items-center gap-1.5">
                          <button
                            onClick={() => { const fd = new FormData(); fd.set("id", a.id); fd.set("enabled", String(!a.enabled)); run(setAccountEnabledAction, fd); }}
                            disabled={pending}
                            className={`mono rounded-full border px-2.5 py-1 text-[10px] transition disabled:opacity-50 ${a.enabled ? "border-ok/40 text-ok hover:bg-ok/10" : "border-border text-muted hover:text-white"}`}
                          >
                            {a.enabled ? "● Bật" : "○ Tắt"}
                          </button>
                          <button
                            onClick={() => { if (confirm(`Xoá key "${a.label}"? Workspace đang gán key này sẽ về pool chung.`)) { const fd = new FormData(); fd.set("id", a.id); run(deleteKlingKeyAction, fd); } }}
                            disabled={pending}
                            title="Xoá key"
                            className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted transition hover:border-bad/50 hover:text-bad disabled:opacity-50"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mono mb-2 text-[10px] text-muted">Gán key cho workspace</p>
                  <div className="space-y-2">
                    {data.workspaces.map((w) => (
                      <div key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-2.5 text-sm">
                        <span className="truncate text-white">{w.name}</span>
                        <select
                          value={w.klingAccountId ?? ""}
                          onChange={(e) => { const fd = new FormData(); fd.set("workspaceId", w.id); fd.set("accountId", e.target.value); run(assignKlingKeyAction, fd); }}
                          disabled={pending}
                          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-white outline-none focus:border-accent disabled:opacity-50"
                        >
                          <option value="">— Pool chung —</option>
                          {data.accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── WORKSPACE ── */}
            {active === "workspace" && (
              <WorkspaceModule
                workspaces={data.manageWorkspaces}
                initialWorkspaceId={initialWorkspaceId}
                canCreate={isAdmin}
                onReload={onReload}
              />
            )}

            {/* ── LIBRARY ── */}
            {active === "library" && (
              <div className="space-y-4">
                {isAdmin && (
                  <div className="flex items-center justify-between rounded-xl border border-dashed border-border p-4">
                    <span className="text-sm text-muted">Thêm video template (dùng chung)</span>
                    <button onClick={() => libRef.current?.click()} disabled={pending} className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent-soft transition hover:bg-accent/25 disabled:opacity-50">+ Tải video</button>
                    <input
                      ref={libRef}
                      type="file"
                      accept="video/*"
                      multiple
                      hidden
                      onChange={(e) => { if (e.target.files?.length) { const fd = new FormData(); Array.from(e.target.files).forEach((f) => fd.append("files", f)); run(uploadLibraryVideoAction, fd); e.target.value = ""; } }}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  {data.libraryVideos.length === 0 && <p className="text-sm text-muted">Chưa có video nào.</p>}
                  {data.libraryVideos.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm">
                      <span className="truncate text-white">{v.name} <span className="ml-1 text-xs text-muted">{v.filename}</span></span>
                      {isAdmin && (
                        <button
                          onClick={() => { if (confirm(`Xoá "${v.name}"?`)) { const fd = new FormData(); fd.set("id", v.id); run(deleteLibraryVideoAction, fd); } }}
                          disabled={pending}
                          className="rounded text-muted transition hover:text-bad disabled:opacity-50"
                          title="Xoá"
                        >
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── APPEARANCE ── */}
            {active === "appearance" && <AppearanceModule />}
          </div>
        </section>
      </div>
    </div>
  );
}

function WorkspaceModule({
  workspaces,
  initialWorkspaceId,
  canCreate,
  onReload,
}: {
  workspaces: { id: string; name: string; canManage: boolean }[];
  initialWorkspaceId?: string;
  canCreate: boolean;
  onReload: () => void;
}) {
  const validInitial = initialWorkspaceId && workspaces.some((w) => w.id === initialWorkspaceId) ? initialWorkspaceId : workspaces[0]?.id ?? "";
  const [selected, setSelected] = useState(validInitial);
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [busy, startBusy] = useTransition();
  const [wsOpen, setWsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);

  function loadDetail(id: string) {
    if (!id) { setDetail(null); return; }
    startBusy(async () => setDetail(await loadWorkspaceDetailAction(id)));
  }
  useEffect(() => { loadDetail(selected); /* eslint-disable-next-line */ }, [selected]);
  useEffect(() => {
    if (!wsOpen) return;
    function onOutside(e: MouseEvent) { if (wsRef.current && !wsRef.current.contains(e.target as Node)) setWsOpen(false); }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [wsOpen]);

  function submit(action: (fd: FormData) => Promise<unknown>, fd: FormData, reset?: () => void) {
    startBusy(async () => { await action(fd); setDetail(await loadWorkspaceDetailAction(selected)); reset?.(); });
  }
  function createWs() {
    const name = newWsName.trim();
    if (!name) return;
    startBusy(async () => {
      const fd = new FormData();
      fd.set("name", name);
      const id = await createWorkspaceFromSettingsAction(fd);
      setNewWsName("");
      setCreating(false);
      setWsOpen(false);
      setSelected(id);
      onReload();
    });
  }

  if (workspaces.length === 0 && !canCreate) return <p className="text-sm text-muted">Bạn không quản lý workspace nào.</p>;

  const selectedName = workspaces.find((w) => w.id === selected)?.name ?? "Chọn workspace";

  return (
    <div className="space-y-5">
      {/* Workspace selector with inline create */}
      <div ref={wsRef} className="relative">
        <span className="mono mb-1.5 block text-[10px] text-muted">Workspace</span>
        <button type="button" onClick={() => setWsOpen((o) => !o)} className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white transition hover:border-accent/60">
          <span className="truncate">{selectedName}</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-muted" style={{ transform: wsOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {wsOpen && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl">
            {workspaces.map((w) => (
              <button key={w.id} type="button" onClick={() => { setSelected(w.id); setWsOpen(false); }} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-white/5 ${w.id === selected ? "text-accent-soft" : "text-white"}`}>
                <span className="truncate">{w.name}</span>
                {w.id === selected && <span className="text-accent-soft">&#9679;</span>}
              </button>
            ))}
            {workspaces.length === 0 && <p className="px-3 py-2 text-sm text-muted">Chưa có workspace.</p>}
            {canCreate && (
              <div className="mt-1 border-t border-border p-1.5">
                {creating ? (
                  <div className="flex gap-1.5">
                    <input autoFocus value={newWsName} onChange={(e) => setNewWsName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createWs(); }} placeholder="Tên workspace mới" className="flex-1 rounded-md border border-border bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none focus:border-accent" />
                    <button type="button" onClick={createWs} disabled={busy || !newWsName.trim()} className="rounded-md bg-gradient-to-b from-accent-soft to-accent px-3 text-sm font-semibold text-[#04212c] disabled:opacity-50">Tạo</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-accent-soft transition hover:bg-accent/10">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
                    Tạo workspace
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {busy && !detail && <p className="text-sm text-muted">Đang tải…</p>}

      {detail && (
        <>
          {detail.canManage && (
            <form onSubmit={(e) => { e.preventDefault(); submit(renameWorkspaceFromSettingsAction, new FormData(e.currentTarget)); }} className="flex gap-2">
              <input type="hidden" name="workspaceId" value={detail.id} />
              <input name="name" defaultValue={detail.name} key={detail.id} required className="flex-1 rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent" />
              <button disabled={busy} className="rounded-lg bg-gradient-to-b from-accent-soft to-accent px-4 py-2 text-sm font-semibold text-[#04212c] transition hover:brightness-110 disabled:opacity-50">Lưu tên</button>
            </form>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1px_1fr]">
            <section className="min-w-0">
              <SectionHeader title={`Projects (${detail.projects.length})`} canAdd={detail.canManage} open={showAddProject} onToggle={() => setShowAddProject((v) => !v)} />
              {detail.canManage && showAddProject && (
                <form onSubmit={(e) => { const f = e.currentTarget; e.preventDefault(); submit(createProjectFromSettingsAction, new FormData(f), () => f.reset()); }} className="mb-2 flex gap-2">
                  <input type="hidden" name="workspaceId" value={detail.id} />
                  <input name="name" required autoFocus placeholder="Tên project" className="flex-1 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-accent" />
                  <button disabled={busy} className="rounded-lg border border-accent/50 bg-accent/15 px-3 text-sm font-semibold text-accent-soft disabled:opacity-50">Tạo</button>
                </form>
              )}
              <div className="space-y-1.5">
                {detail.projects.length === 0 && <p className="text-sm text-muted">Chưa có project.</p>}
                {detail.projects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="truncate text-white">{p.name}</span>
                    {detail.canManage && <DeleteIcon onClick={() => { if (confirm(`Xoá project "${p.name}"?`)) { const fd = new FormData(); fd.set("projectId", p.id); submit(deleteProjectFromSettingsAction, fd); } }} disabled={busy} />}
                  </div>
                ))}
              </div>
            </section>

            <div className="hidden w-px self-stretch bg-gradient-to-b from-transparent via-accent to-transparent shadow-[0_0_8px_rgb(var(--color-accent)/0.7)] md:block" />

            <section className="min-w-0">
              <SectionHeader title={`Thành viên (${detail.members.length})`} canAdd={detail.canManage} open={showAddMember} onToggle={() => setShowAddMember((v) => !v)} />
              {detail.canManage && showAddMember && (
                <form onSubmit={(e) => { const f = e.currentTarget; e.preventDefault(); submit(addMemberFromSettingsAction, new FormData(f), () => f.reset()); }} className="mb-2 flex flex-wrap gap-2">
                  <input type="hidden" name="workspaceId" value={detail.id} />
                  <input name="email" type="email" required autoFocus placeholder="email@crossian.com" className="flex-1 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-accent" />
                  <select name="role" defaultValue="member" className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-white outline-none focus:border-accent">
                    <option value="member">member</option>
                    <option value="manager">manager</option>
                  </select>
                  <button disabled={busy} className="rounded-lg border border-accent/50 bg-accent/15 px-3 text-sm font-semibold text-accent-soft disabled:opacity-50">Thêm</button>
                </form>
              )}
              <div className="space-y-1.5">
                {detail.members.length === 0 && <p className="text-sm text-muted">Chưa có thành viên.</p>}
                {detail.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="truncate text-white">{m.name} <span className="mono ml-1 text-accent-soft">{m.role}</span></span>
                    {detail.canManage && <DeleteIcon onClick={() => { const fd = new FormData(); fd.set("workspaceId", detail.id); fd.set("userId", m.userId); submit(removeMemberFromSettingsAction, fd); }} disabled={busy} />}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeader({ title, canAdd, open, onToggle }: { title: string; canAdd: boolean; open: boolean; onToggle: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <p className="mono text-[10px] text-muted">{title}</p>
      {canAdd && (
        <button type="button" onClick={onToggle} title={open ? "Đóng" : "Thêm"} className="grid h-6 w-6 place-items-center rounded-lg border border-border text-accent-soft transition hover:border-accent hover:bg-accent/10">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ transform: open ? "rotate(45deg)" : "none", transition: "transform .15s" }}><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
    </div>
  );
}

function DeleteIcon({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title="Xoá" className="flex-none rounded text-muted transition hover:text-bad disabled:opacity-50">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
    </button>
  );
}

function AppearanceModule() {
  const [theme, setTheme] = useState("teal");
  useEffect(() => {
    try { setTheme(localStorage.getItem("kdf-theme") ?? "teal"); } catch {}
  }, []);
  function apply(id: string) {
    setTheme(id);
    try { localStorage.setItem("kdf-theme", id); } catch {}
    document.documentElement.dataset.theme = id === "teal" ? "" : id;
  }
  return (
    <div>
      <p className="mono mb-3 text-[10px] text-muted">Theme màu</p>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => apply(t.id)}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${theme === t.id ? "border-accent bg-accent/15 text-white" : "border-border text-muted hover:border-accent/50 hover:text-white"}`}
          >
            <span className="h-4 w-4 flex-none rounded-full" style={{ background: t.color }} />
            {t.label}
            {theme === t.id && <span className="ml-auto text-accent-soft">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
