import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { canManageWorkspace, canCreateProject } from "@/lib/access";
import { Card, PageHeader, Button, TextInput, Select } from "@/components/ui";
import {
  createProjectAction,
  deleteProjectAction,
} from "./projects/actions";
import { addMemberAction, removeMemberAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const user = await requireUser();
  const result = await getWorkspaceForUser(user, params.workspaceId);
  if (!result) notFound();
  const { workspace, membership } = result;
  const canManage = canManageWorkspace(user.role, membership);
  const canAddProject = canCreateProject(user.role, membership);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={workspace.name} subtitle="Workspace" />
        <Link href={`/workspaces/${workspace.id}/studio`}>
          <Button>🎬 Mở Studio →</Button>
        </Link>
      </div>

      {/* Projects */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-white">Projects</h2>
        {canAddProject && (
          <Card className="mb-3">
            <form action={createProjectAction} className="flex gap-2">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <TextInput
                name="name"
                placeholder="Tên project mới"
                required
                className="flex-1"
              />
              <Button type="submit">Tạo project</Button>
            </form>
          </Card>
        )}
        <div className="space-y-2">
          {workspace.projects.length === 0 && (
            <Card>
              <p className="text-muted">Chưa có project nào.</p>
            </Card>
          )}
          {workspace.projects.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center justify-between">
                <Link
                  href={`/workspaces/${workspace.id}/projects/${p.id}`}
                  className="text-white hover:text-accent-soft"
                >
                  {p.name}
                </Link>
                {canManage && (
                  <form action={deleteProjectAction}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="projectId" value={p.id} />
                    <Button variant="ghost" type="submit">
                      Xoá
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Members */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium text-white">Thành viên</h2>
        {canManage && (
          <Card className="mb-3">
            <form action={addMemberAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <TextInput
                name="email"
                type="email"
                placeholder="email@crossian.com"
                required
                className="flex-1"
              />
              <Select name="role" defaultValue="member">
                <option value="member">member</option>
                <option value="manager">manager</option>
              </Select>
              <Button type="submit">Thêm</Button>
            </form>
          </Card>
        )}
        <div className="space-y-2">
          {workspace.members.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center justify-between">
                <span className="text-white">
                  {m.user.name ?? m.user.email}{" "}
                  <span className="text-accent-soft">({m.role})</span>
                </span>
                {canManage && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <Button variant="ghost" type="submit">
                      Gỡ
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
          {workspace.members.length === 0 && (
            <Card>
              <p className="text-muted">Chưa có thành viên nào được thêm.</p>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
