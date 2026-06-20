"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceRole } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { createWorkspace, addMember, removeMember } from "@/lib/workspaces";

export async function createWorkspaceAction(formData: FormData) {
  const actor = await requireUser();
  const name = String(formData.get("name") ?? "");
  await createWorkspace(actor, name);
  revalidatePath("/workspaces");
}

export async function addMemberAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "member") as WorkspaceRole;
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
