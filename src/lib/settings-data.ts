import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { listUsersForRoleSettings, listWorkspaceApiSettings } from "@/lib/app-settings";
import { listAccountsForAdmin } from "@/lib/kling-accounts";
import { listLibraryVideos } from "@/lib/library-videos";

export type SettingsUser = { id: string; email: string; name: string | null; role: string; createdAt: string };
export type SettingsAccount = { id: string; label: string; enabled: boolean; maxConcurrent: number };
export type SettingsWorkspace = { id: string; name: string; klingAccountId: string | null };
export type SettingsLibraryVideo = { id: string; name: string; filename: string };
export type ManageWorkspace = { id: string; name: string; canManage: boolean };

export type SettingsData = {
  role: string;
  users: SettingsUser[];
  accounts: SettingsAccount[];
  workspaces: SettingsWorkspace[];
  libraryVideos: SettingsLibraryVideo[];
  manageWorkspaces: ManageWorkspace[];
};

export type WorkspaceDetail = {
  id: string;
  name: string;
  canManage: boolean;
  projects: { id: string; name: string }[];
  members: { id: string; userId: string; name: string; role: string }[];
};

/** Detail for one workspace (rename/projects/members), if the actor can access it. */
export async function getWorkspaceDetail(
  actor: CurrentUser,
  workspaceId: string,
): Promise<WorkspaceDetail | null> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: { include: { user: true }, orderBy: { createdAt: "asc" } },
      projects: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!ws) return null;
  const myMembership = ws.members.find((m) => m.userId === actor.id) ?? null;
  if (actor.role !== "super_admin" && !myMembership) return null;
  const canManage = actor.role === "super_admin" || myMembership?.role === "manager";
  return {
    id: ws.id,
    name: ws.name,
    canManage,
    projects: ws.projects.map((p) => ({ id: p.id, name: p.name })),
    members: ws.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name ?? m.user.email,
      role: m.role,
    })),
  };
}

/** All data the shared Settings panel needs, role-gated. Non-admins get empty admin sections. */
export async function getSettingsData(actor: CurrentUser): Promise<SettingsData> {
  const isAdmin = actor.role === "super_admin";
  const libraryVideos = (await listLibraryVideos()).map((v) => ({
    id: v.id,
    name: v.name,
    filename: v.filename,
  }));

  // Workspaces the actor can see, flagged with whether they may manage each.
  let manageWorkspaces: ManageWorkspace[];
  if (isAdmin) {
    const all = await db.workspace.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
    manageWorkspaces = all.map((w) => ({ id: w.id, name: w.name, canManage: true }));
  } else {
    const mine = await db.workspace.findMany({
      where: { members: { some: { userId: actor.id } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, members: { where: { userId: actor.id }, select: { role: true } } },
    });
    manageWorkspaces = mine.map((w) => ({ id: w.id, name: w.name, canManage: w.members[0]?.role === "manager" }));
  }

  if (!isAdmin) {
    return { role: actor.role, users: [], accounts: [], workspaces: [], libraryVideos, manageWorkspaces };
  }

  const [users, accounts, workspaces] = await Promise.all([
    listUsersForRoleSettings(actor),
    listAccountsForAdmin(actor),
    listWorkspaceApiSettings(actor),
  ]);

  return {
    role: actor.role,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      label: a.label,
      enabled: a.enabled,
      maxConcurrent: a.maxConcurrent,
    })),
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      klingAccountId: w.klingAccountId ?? null,
    })),
    libraryVideos,
    manageWorkspaces,
  };
}
