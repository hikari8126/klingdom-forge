import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listWorkspacesForUser } from "@/lib/workspaces";
import { canCreateWorkspace } from "@/lib/access";
import { Card, PageHeader, Button, TextInput } from "@/components/ui";
import { createWorkspaceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader title="Workspaces" subtitle="Không gian làm việc của bạn" />

      {canCreateWorkspace(user.role) && (
        <Card className="mt-8">
          <form action={createWorkspaceAction} className="flex gap-2">
            <TextInput
              name="name"
              placeholder="Tên workspace mới"
              required
              className="flex-1"
            />
            <Button type="submit">Tạo</Button>
          </form>
        </Card>
      )}

      <div className="mt-4 space-y-3">
        {workspaces.length === 0 && (
          <Card>
            <p className="text-muted">Chưa có workspace nào.</p>
          </Card>
        )}
        {workspaces.map((w) => (
          <Card key={w.id} className="flex items-center justify-between gap-3 transition hover:bg-white/5">
            <Link href={`/workspaces/${w.id}/studio`} className="flex-1 text-white hover:text-accent-soft">
              {w.name} <span className="text-sm text-muted">→ Studio</span>
            </Link>
            <Link href={`/workspaces/${w.id}`} title="Thành viên & cài đặt" className="flex-none text-muted hover:text-accent-soft">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.8 7.8 0 000-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 00-1.7-1l-.4-2.6H9.7l-.4 2.6a7.6 7.6 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7.8 7.8 0 000 2l-2 1.5 2 3.4 2.3-1c.5.4 1.1.7 1.7 1l.4 2.6h4.6l.4-2.6c.6-.3 1.2-.6 1.7-1l2.3 1 2-3.4z" /></svg>
            </Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
