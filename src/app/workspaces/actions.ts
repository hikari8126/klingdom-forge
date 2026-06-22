"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { createWorkspace, renameWorkspace, addMember, removeMember, saveWorkspaceKlingKey, clearWorkspaceKlingKey } from "@/lib/workspaces";

export async function createWorkspaceAction(formData: FormData) {
  const actor = await requireUser();
  const name = String(formData.get("name") ?? "");
  const ws = await createWorkspace(actor, name);
  revalidatePath("/workspaces");
  // Jump straight into the new workspace's studio.
  redirect(`/workspaces/${ws.id}/studio`);
}

export async function renameWorkspaceAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "");
  await renameWorkspace(actor, workspaceId, name);
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/workspaces");
}

export async function addMemberAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const email = String(formData.get("email") ?? "");
  // Normalize to a valid enum value — never trust the raw form string.
  const role: WorkspaceRole =
    String(formData.get("role") ?? "member") === "manager" ? "manager" : "member";
  await addMember(actor, workspaceId, email, role);
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function removeMemberAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  await removeMember(actor, workspaceId, userId);
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function saveWorkspaceKlingKeyAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "");
  await saveWorkspaceKlingKey(actor, workspaceId, apiKey);
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function clearWorkspaceKlingKeyAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await clearWorkspaceKlingKey(actor, workspaceId);
  revalidatePath(`/workspaces/${workspaceId}`);
}
