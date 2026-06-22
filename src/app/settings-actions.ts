"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { getSettingsData, getWorkspaceDetail, type SettingsData, type WorkspaceDetail } from "@/lib/settings-data";
import { parseAppRole, setUserRoleByEmail } from "@/lib/app-settings";
import { renameWorkspace, addMember, removeMember, createWorkspace } from "@/lib/workspaces";
import { createProject, deleteProject } from "@/lib/projects";
import type { WorkspaceRole } from "@prisma/client";
import {
  createKlingAccount,
  setAccountEnabled,
  assignAccountToWorkspace,
  deleteKlingAccount,
} from "@/lib/kling-accounts";
import { createLibraryVideo, deleteLibraryVideo } from "@/lib/library-videos";
import { assertVideoSize } from "@/lib/uploads";

function revalidateAll() {
  // The settings panel is reachable from every page → refresh the whole tree.
  revalidatePath("/", "layout");
}

/** Fetch all settings data for the current user (role-gated). Called lazily when the panel opens. */
export async function loadSettingsDataAction(): Promise<SettingsData> {
  const actor = await requireUser();
  return getSettingsData(actor);
}

export async function setUserRoleAction(formData: FormData) {
  const actor = await requireUser();
  const email = String(formData.get("email") ?? "");
  const role = parseAppRole(formData.get("role"));
  await setUserRoleByEmail(actor, email, role);
  revalidateAll();
}

export async function createKlingKeyAction(formData: FormData) {
  const actor = await requireUser();
  const label = String(formData.get("label") ?? "");
  const accessKey = String(formData.get("accessKey") ?? "");
  const maxRaw = Number(formData.get("maxConcurrent") ?? 5);
  await createKlingAccount(actor, {
    label,
    accessKey,
    maxConcurrent: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 5,
  });
  revalidateAll();
}

export async function setAccountEnabledAction(formData: FormData) {
  const actor = await requireUser();
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await setAccountEnabled(actor, id, enabled);
  revalidateAll();
}

export async function deleteKlingKeyAction(formData: FormData) {
  const actor = await requireUser();
  await deleteKlingAccount(actor, String(formData.get("id") ?? ""));
  revalidateAll();
}

export async function assignKlingKeyAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const accountIdRaw = String(formData.get("accountId") ?? "");
  await assignAccountToWorkspace(actor, workspaceId, accountIdRaw || null);
  revalidateAll();
}

export async function uploadLibraryVideoAction(formData: FormData) {
  const actor = await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const name = String(formData.get("name") ?? "").trim();
  if (files.length === 0) throw new Error("Chọn ít nhất một video");
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    assertVideoSize(buf, file.name);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const displayName =
      files.length === 1 ? name || baseName : name ? `${name} · ${baseName}` : baseName;
    await createLibraryVideo(actor, displayName, file.name, buf);
  }
  revalidateAll();
}

export async function deleteLibraryVideoAction(formData: FormData) {
  const actor = await requireUser();
  const id = String(formData.get("id") ?? "");
  await deleteLibraryVideo(actor, id);
  revalidateAll();
}

// ── Workspace module ────────────────────────────────────────────────────────

export async function loadWorkspaceDetailAction(workspaceId: string): Promise<WorkspaceDetail | null> {
  const actor = await requireUser();
  return getWorkspaceDetail(actor, workspaceId);
}

export async function createWorkspaceFromSettingsAction(formData: FormData): Promise<string> {
  const actor = await requireUser();
  const ws = await createWorkspace(actor, String(formData.get("name") ?? ""));
  revalidateAll();
  return ws.id;
}

export async function renameWorkspaceFromSettingsAction(formData: FormData) {
  const actor = await requireUser();
  await renameWorkspace(actor, String(formData.get("workspaceId") ?? ""), String(formData.get("name") ?? ""));
  revalidateAll();
}

export async function createProjectFromSettingsAction(formData: FormData) {
  const actor = await requireUser();
  await createProject(actor, String(formData.get("workspaceId") ?? ""), String(formData.get("name") ?? ""));
  revalidateAll();
}

export async function deleteProjectFromSettingsAction(formData: FormData) {
  const actor = await requireUser();
  await deleteProject(actor, String(formData.get("projectId") ?? ""));
  revalidateAll();
}

export async function addMemberFromSettingsAction(formData: FormData) {
  const actor = await requireUser();
  const role = (String(formData.get("role") ?? "member") === "manager" ? "manager" : "member") as WorkspaceRole;
  await addMember(actor, String(formData.get("workspaceId") ?? ""), String(formData.get("email") ?? ""), role);
  revalidateAll();
}

export async function removeMemberFromSettingsAction(formData: FormData) {
  const actor = await requireUser();
  await removeMember(actor, String(formData.get("workspaceId") ?? ""), String(formData.get("userId") ?? ""));
  revalidateAll();
}
