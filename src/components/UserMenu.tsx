"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOutAction } from "@/app/auth-actions";
import { loadSettingsDataAction } from "@/app/settings-actions";
import { SettingsPanel, type ModuleId } from "@/components/SettingsPanel";
import type { SettingsData } from "@/lib/settings-data";

export function UserMenu({
  initials,
  fullName,
  role,
}: {
  initials: string;
  fullName: string;
  role: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SettingsData | null>(null);
  const [initialModule, setInitialModule] = useState<ModuleId | undefined>();
  const [initialWs, setInitialWs] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const loadAndOpen = useCallback((mod?: ModuleId, ws?: string) => {
    setInitialModule(mod);
    setInitialWs(ws);
    start(async () => {
      const d = await loadSettingsDataAction();
      setData(d);
    });
  }, []);

  // Open the panel when a ?settings=<module> query param is present (links from anywhere).
  const settingsParam = searchParams.get("settings");
  useEffect(() => {
    if (!settingsParam) return;
    const ws = searchParams.get("ws") ?? undefined;
    loadAndOpen(settingsParam as ModuleId, ws);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsParam]);

  function closePanel() {
    setData(null);
    if (searchParams.get("settings")) {
      router.replace(pathname, { scroll: false });
    }
  }

  function reload() {
    start(async () => {
      const d = await loadSettingsDataAction();
      setData(d);
      router.refresh();
    });
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-[11px] font-bold text-[#06222c] transition hover:brightness-110"
          style={{ background: "conic-gradient(from 200deg,rgb(var(--color-accent)),rgb(var(--color-ok)),rgb(var(--color-yellow)),rgb(var(--color-accent)))" }}
          title={fullName}
        >
          {initials}
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            <div className="border-b border-border px-3 py-2.5">
              <p className="truncate text-xs font-medium text-white">{fullName}</p>
              <p className="mono mt-0.5 text-[9px] text-muted">{role}</p>
            </div>
            <button
              type="button"
              onClick={() => { setOpen(false); loadAndOpen(); }}
              className="flex w-full items-center justify-between border-b border-border px-3 py-2.5 text-left text-sm text-muted transition hover:bg-white/5 hover:text-accent-soft"
            >
              <span>
                <span className="block font-medium text-white">Settings</span>
                <span className="mt-0.5 block text-[11px] text-muted">{role === "super_admin" ? "Role, Key, Workspace, Library, Giao diện" : "Workspace, Library, Giao diện"}</span>
              </span>
              <span className="text-accent-soft">→</span>
            </button>
            <form action={signOutAction}>
              <button type="submit" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted transition hover:bg-white/5 hover:text-bad">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Đăng xuất
              </button>
            </form>
          </div>
        )}
      </div>

      {mounted && pending && !data && createPortal(
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 text-sm text-muted">Đang tải settings…</div>,
        document.body,
      )}
      {mounted && data && createPortal(
        <SettingsPanel data={data} initialModule={initialModule} initialWorkspaceId={initialWs} onReload={reload} onClose={closePanel} />,
        document.body,
      )}
    </>
  );
}
