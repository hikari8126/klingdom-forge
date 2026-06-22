import Link from "next/link";
import type { CurrentUser } from "@/lib/session";
import { getLatestStudioHref } from "@/lib/workspaces";
import { UserMenu } from "@/components/UserMenu";

function initialsOf(user: CurrentUser): string {
  const base = (user.name ?? user.email ?? "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export async function AppHeader({
  user,
  crumb,
  workerOnline,
  studioHref,
}: {
  user: CurrentUser;
  crumb: string;
  workerOnline: boolean;
  studioHref?: string;
}) {
  const resolvedStudioHref = studioHref ?? (await getLatestStudioHref(user));
  return (
    <header className="sticky top-0 z-40 flex h-[60px] items-center gap-4 border-b border-border bg-bg/[.62] px-6 backdrop-blur-[14px]">
      <Link href="/" className="flex items-center gap-2.5 text-white">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-gradient-to-br from-accent-soft to-accent shadow-glow-accent">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#04212c">
            <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 15l5 3-5 3z" />
          </svg>
        </span>
        <span className="font-heading text-[15px] font-semibold tracking-tight">KlingDom Forge</span>
      </Link>
      <span className="text-[#384150]">/</span>
      <span className="mono text-muted">{crumb}</span>

      <div className="flex-1" />

      <Link
        href={resolvedStudioHref}
        className="flex items-center gap-1.5 rounded-full border border-accent/45 bg-accent/[.12] px-3.5 py-[7px] text-[12.5px] font-semibold text-accent-soft transition hover:bg-accent/[.22]"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path d="M5 3l14 9-14 9z" />
        </svg>
        Studio
      </Link>

      <div
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
          workerOnline ? "border-ok/40 text-ok" : "border-border text-muted"
        } mono`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${workerOnline ? "bg-ok shadow-[0_0_8px_rgb(var(--color-ok))]" : "bg-muted"}`}
        />
        {workerOnline ? "Worker online" : "Worker offline"}
      </div>

      <UserMenu initials={initialsOf(user)} fullName={user.name ?? user.email} role={user.role} />
    </header>
  );
}
