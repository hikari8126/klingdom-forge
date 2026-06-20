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
          <Link key={w.id} href={`/workspaces/${w.id}`} className="block">
            <Card className="transition hover:bg-white/5">
              <span className="text-white">{w.name}</span>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
