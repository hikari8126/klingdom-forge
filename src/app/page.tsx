import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDashboardData } from "@/lib/dashboard";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

function firstName(name: string | null, email: string): string {
  if (name?.trim()) return name.trim().split(/\s+/)[0];
  return email.split("@")[0] || "bạn";
}

export default async function Home() {
  const user = await requireUser();
  const data = await getDashboardData(user);

  const stats: { label: string; value: number; sub: string; color: string }[] = [
    { label: "Workspaces", value: data.stats.workspaces, sub: "không gian làm việc", color: "text-white" },
    { label: "Projects", value: data.stats.projects, sub: "tổng số project", color: "text-white" },
    { label: "Video 30 ngày", value: data.stats.videos30d, sub: "đã dựng xong", color: "text-ok" },
    { label: "Job đang chạy", value: data.stats.running, sub: "trong hàng đợi", color: data.stats.running > 0 ? "text-accent-soft" : "text-muted" },
  ];

  return (
    <>
      <AppHeader user={user} crumb="Dashboard" workerOnline={data.system.worker} />

      <div className="mx-auto max-w-[1080px] animate-fade-up px-7 pb-20 pt-10">
        {/* Greeting */}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mono text-muted">Bảng điều khiển</div>
            <h1 className="font-heading mt-2 text-[32px] font-semibold tracking-tight text-white">
              Chào {firstName(user.name, user.email)}, sẵn sàng dựng video chưa?
            </h1>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mt-7 grid grid-cols-2 gap-3.5 md:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/[.07] bg-gradient-to-b from-white/[.05] to-white/[.012] p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-[16px]"
            >
              <div className="mono text-muted">{s.label}</div>
              <div className={`font-heading mt-2.5 text-[30px] font-semibold ${s.color}`}>{s.value}</div>
              <div className="mt-1 text-[11.5px] text-muted">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Two-column body */}
        <div className="mt-4 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
          {/* Mở Studio hero */}
          <div className="relative flex flex-col overflow-hidden rounded-[18px] border border-accent/35 bg-gradient-to-br from-accent/[.22] to-surface/[.55] p-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-[16px]">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgb(var(--color-accent)/.45),transparent_70%)] blur-[10px]" />
            <div className="relative flex flex-1 flex-col">
              <h3 className="font-heading m-0 text-[19px] font-semibold text-white">Mở Studio</h3>
              <p className="mb-4 mt-[7px] max-w-[340px] text-[13px] text-muted">
                Kéo–thả ảnh và video lên canvas, dựng hàng loạt clip Image→Video và Motion Control.
              </p>
              <div className="mt-auto">
                <Link
                  href="/workspaces"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-accent-soft to-accent px-[18px] py-2.5 text-[13.5px] font-semibold text-[#04212c] shadow-glow-accent transition hover:brightness-110"
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M5 3l14 9-14 9z" /></svg>
                  Vào canvas
                </Link>
              </div>
            </div>
          </div>

          {/* System status + Settings */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 rounded-[18px] border border-white/[.07] bg-gradient-to-b from-white/[.05] to-white/[.012] p-5 backdrop-blur-[16px]">
              <h3 className="font-heading m-0 mb-3.5 text-[15px] font-semibold text-white">Trạng thái hệ thống</h3>
              <div className="flex flex-col gap-[11px]">
                <StatusRow label="Database" ok={data.system.db} okText="Đã kết nối" badText="Offline" />
                <StatusRow label="Worker" ok={data.system.worker} okText="Online" badText="Offline" />
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted">Kling accounts</span>
                  <span className={`text-[12.5px] ${data.system.klingAccounts > 0 ? "text-white" : "text-bad"}`}>
                    {data.system.klingAccounts} đang bật
                  </span>
                </div>
              </div>
            </div>

            <Link
              href={user.role === "super_admin" ? "/?settings=role" : "/?settings=workspace"}
              className="flex items-center justify-between rounded-[18px] border border-white/[.07] bg-gradient-to-b from-white/[.05] to-white/[.012] px-5 py-[18px] backdrop-blur-[16px] transition hover:border-accent/50 hover:bg-accent/[.08]"
            >
              <span className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-accent-soft"><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.8 7.8 0 000-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 00-1.7-1l-.4-2.6H9.7l-.4 2.6a7.6 7.6 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7.8 7.8 0 000 2l-2 1.5 2 3.4 2.3-1c.5.4 1.1.7 1.7 1l.4 2.6h4.6l.4-2.6c.6-.3 1.2-.6 1.7-1l2.3 1 2-3.4z" /></svg>
                <span>
                  <span className="block text-[13.5px] font-medium text-white">Cài đặt</span>
                  <span className="block text-[11px] text-muted">{user.role === "super_admin" ? "Role, Key, Workspace, Library, Giao diện" : "Workspace, Library, Giao diện"}</span>
                </span>
              </span>
              <span className="text-accent-soft">→</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusRow({
  label,
  ok,
  okText,
  badText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`flex items-center gap-1.5 text-[12.5px] ${ok ? "text-ok" : "text-bad"}`}>
        <span className={`h-[7px] w-[7px] rounded-full ${ok ? "bg-ok shadow-[0_0_8px_rgb(var(--color-ok))]" : "bg-bad"}`} />
        {ok ? okText : badText}
      </span>
    </div>
  );
}

