import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listWorkspaceCardsForUser } from "@/lib/workspaces";
import { canCreateWorkspace } from "@/lib/access";
import { isWorkerOnline } from "@/lib/worker-status";
import { AppHeader } from "@/components/AppHeader";
import { createWorkspaceAction } from "./actions";

export const dynamic = "force-dynamic";

/** Deterministic hue (0–360) from a workspace id, so each cover looks distinct but stable. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export default async function WorkspacesPage() {
  const user = await requireUser();
  const [workspaces, workerOnline] = await Promise.all([
    listWorkspaceCardsForUser(user),
    isWorkerOnline(),
  ]);

  return (
    <>
      <AppHeader user={user} crumb="Workspaces" workerOnline={workerOnline} />

      <div className="mx-auto max-w-[1080px] animate-fade-up px-7 pb-20 pt-10">
        <Link
          href="/"
          className="mb-[18px] inline-flex items-center gap-1.5 text-[12.5px] text-muted transition hover:text-accent-soft"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Bảng điều khiển
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading m-0 text-[30px] font-semibold tracking-tight text-white">Workspaces</h1>
            <p className="mt-[7px] text-sm text-muted">Không gian làm việc của bạn</p>
          </div>
        </div>

        {canCreateWorkspace(user.role) && (
          <form
            action={createWorkspaceAction}
            className="mt-6 flex gap-2.5 rounded-2xl border border-white/[.07] bg-gradient-to-b from-white/[.05] to-white/[.012] p-4 backdrop-blur-[16px]"
          >
            <input
              name="name"
              required
              placeholder="Tên workspace mới…"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-[11px] text-sm text-white outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-b from-accent-soft to-accent px-5 py-[11px] text-[13.5px] font-semibold text-[#04212c] transition hover:brightness-110"
            >
              Tạo
            </button>
          </form>
        )}

        {workspaces.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/[.07] bg-gradient-to-b from-white/[.05] to-white/[.012] p-8 text-center text-muted backdrop-blur-[16px]">
            Chưa có workspace nào.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((w) => {
              const hue = hueOf(w.id);
              return (
                <div
                  key={w.id}
                  className="overflow-hidden rounded-[18px] border border-white/[.07] bg-gradient-to-b from-white/[.045] to-white/[.01] backdrop-blur-[16px] transition hover:-translate-y-[3px] hover:border-accent/45"
                >
                  <div
                    className="relative h-[74px]"
                    style={{ background: `linear-gradient(135deg, hsl(${hue} 52% 40%), hsl(${hue} 48% 18%))` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface/45" />
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="none"
                      stroke="rgba(255,255,255,.55)"
                      strokeWidth="1.4"
                      className="absolute bottom-3.5 left-4"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <path d="M3 14l4-4 5 5 3-3 6 6" />
                      <circle cx="8.5" cy="8.5" r="1.6" />
                    </svg>
                  </div>
                  <div className="p-4">
                    <Link href={`/workspaces/${w.id}/studio`} className="text-white hover:text-accent-soft">
                      <h3 className="font-heading m-0 text-[17px] font-semibold">{w.name}</h3>
                    </Link>
                    <p className="mb-3.5 mt-1.5 text-[12.5px] text-muted">Không gian dựng video AI</p>
                    <div className="mono flex items-center gap-3.5 normal-case text-muted">
                      <span>{w._count.projects} PROJECT</span>
                      <span>{w._count.members} THÀNH VIÊN</span>
                    </div>
                    <div className="mt-3.5 flex gap-2">
                      <Link
                        href={`/workspaces/${w.id}/studio`}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-accent/40 bg-accent/[.12] py-2.5 text-[12.5px] font-semibold text-accent-soft transition hover:bg-accent/[.22]"
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                          <path d="M5 3l14 9-14 9z" />
                        </svg>
                        Studio
                      </Link>
                      <Link
                        href={`/workspaces?settings=workspace&ws=${w.id}`}
                        title="Thành viên & cài đặt"
                        scroll={false}
                        className="grid w-[38px] place-items-center rounded-[10px] border border-border text-muted transition hover:border-accent/40 hover:text-accent-soft"
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 13a7.8 7.8 0 000-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 00-1.7-1l-.4-2.6H9.7l-.4 2.6a7.6 7.6 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7.8 7.8 0 000 2l-2 1.5 2 3.4 2.3-1c.5.4 1.1.7 1.7 1l.4 2.6h4.6l.4-2.6c.6-.3 1.2-.6 1.7-1l2.3 1 2-3.4z" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
