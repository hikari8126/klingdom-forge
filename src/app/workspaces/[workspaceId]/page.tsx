import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { canManageWorkspace, canCreateProject } from "@/lib/access";
import { Card, PageHeader, Button, TextInput, Select } from "@/components/ui";
import { BackButton } from "@/components/BackButton";
import {
  createProjectAction,
  deleteProjectAction,
} from "./projects/actions";
import { addMemberAction, removeMemberAction, saveWorkspaceKlingKeyAction, clearWorkspaceKlingKeyAction } from "../actions";

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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <BackButton fallback={`/workspaces/${workspace.id}/studio`} />
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

      {/* Kling API Key */}
      {canManage && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-medium text-white">Kling API Key</h2>
          <Card>
            {workspace.klingApiKeyEnc ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 font-mono text-sm text-muted">
                    ••••••••••••••••••••••••••••••••
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-ok">
                    <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                    Đã cấu hình
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={saveWorkspaceKlingKeyAction} className="flex flex-1 gap-2">
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <TextInput
                      name="apiKey"
                      type="password"
                      placeholder="Nhập API key mới để thay thế…"
                      required
                      className="flex-1"
                    />
                    <Button type="submit">Cập nhật</Button>
                  </form>
                  <form action={clearWorkspaceKlingKeyAction}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <Button variant="ghost" type="submit">Xoá key</Button>
                  </form>
                </div>
              </div>
            ) : (
              <form action={saveWorkspaceKlingKeyAction} className="flex gap-2">
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <TextInput
                  name="apiKey"
                  type="password"
                  placeholder="Nhập Kling API key của workspace…"
                  required
                  className="flex-1"
                />
                <Button type="submit">Lưu key</Button>
              </form>
            )}
            <p className="mt-2 text-xs text-muted">
              API key này được dùng cho mọi job trong workspace. Lưu một lần và giữ mãi cho đến khi bạn cập nhật.
            </p>
          </Card>
        </section>
      )}

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
