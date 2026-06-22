"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { parseAppRole, setUserRoleByEmail } from "@/lib/app-settings";
import { clearWorkspaceKlingKey, saveWorkspaceKlingKey } from "@/lib/workspaces";
import { createLibraryVideo, deleteLibraryVideo, deleteLibraryVideos } from "@/lib/library-videos";
import { assertVideoSize } from "@/lib/uploads";

function revalidateStudio(workspaceId: string) {
  revalidatePath(`/workspaces/${workspaceId}/studio`);
}

function revalidateWorkspaceApi(currentWorkspaceId: string, targetWorkspaceId: string) {
  revalidatePath("/workspaces");
  revalidatePath(`/workspaces/${targetWorkspaceId}`);
  revalidateStudio(targetWorkspaceId);
  if (targetWorkspaceId !== currentWorkspaceId) revalidateStudio(currentWorkspaceId);
}

export async function setUserRoleAction(currentWorkspaceId: string, formData: FormData) {
  const actor = await requireUser();
  const email = String(formData.get("email") ?? "");
  const role = parseAppRole(formData.get("role"));
  await setUserRoleByEmail(actor, email, role);
  revalidateStudio(currentWorkspaceId);
}

export async function saveWorkspaceKlingKeyFromSettingsAction(
  currentWorkspaceId: string,
  formData: FormData,
) {
  const actor = await requireUser();
  const targetWorkspaceId = String(formData.get("workspaceId") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "");
  await saveWorkspaceKlingKey(actor, targetWorkspaceId, apiKey);
  revalidateWorkspaceApi(currentWorkspaceId, targetWorkspaceId);
}

export async function clearWorkspaceKlingKeyFromSettingsAction(
  currentWorkspaceId: string,
  formData: FormData,
) {
  const actor = await requireUser();
  const targetWorkspaceId = String(formData.get("workspaceId") ?? "");
  await clearWorkspaceKlingKey(actor, targetWorkspaceId);
  revalidateWorkspaceApi(currentWorkspaceId, targetWorkspaceId);
}

export async function uploadLibraryVideoFromSettingsAction(
  currentWorkspaceId: string,
  formData: FormData,
) {
  const actor = await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const name = String(formData.get("name") ?? "").trim();
  if (files.length === 0) throw new Error("Chọn ít nhất một video");

  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    assertVideoSize(buf, file.name);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const displayName =
      files.length === 1 ? (name || baseName) : (name ? `${name} · ${baseName}` : baseName);
    await createLibraryVideo(actor, displayName, file.name, buf);
  }

  revalidatePath("/admin/library");
  revalidateStudio(currentWorkspaceId);
}

export async function deleteLibraryVideoFromSettingsAction(
  currentWorkspaceId: string,
  formData: FormData,
) {
  const actor = await requireUser();
  const id = String(formData.get("id") ?? "");
  await deleteLibraryVideo(actor, id);
  revalidatePath("/admin/library");
  revalidateStudio(currentWorkspaceId);
}

export async function deleteLibraryVideosFromSettingsAction(
  currentWorkspaceId: string,
  formData: FormData,
) {
  const actor = await requireUser();
  const ids = formData.getAll("ids").map((id) => String(id));
  await deleteLibraryVideos(actor, ids);
  revalidatePath("/admin/library");
  revalidateStudio(currentWorkspaceId);
}
