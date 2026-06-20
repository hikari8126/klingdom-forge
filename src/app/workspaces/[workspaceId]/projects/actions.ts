"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createProject, deleteProject } from "@/lib/projects";

export async function createProjectAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "");
  await createProject(actor, workspaceId, name);
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function deleteProjectAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  await deleteProject(actor, projectId);
  revalidatePath(`/workspaces/${workspaceId}`);
}
