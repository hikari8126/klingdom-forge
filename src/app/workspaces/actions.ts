"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { createWorkspace, addMember, removeMember } from "@/lib/workspaces";

export async function createWorkspaceAction(formData: FormData) {
  const actor = await requireUser();
  const name = String(formData.get("name") ?? "");
  const ws = await createWorkspace(actor, name);
  revalidatePath("/workspaces");
  // Jump straight into the new workspace's studio.
  redirect(`/workspaces/${ws.id}/studio`);
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
