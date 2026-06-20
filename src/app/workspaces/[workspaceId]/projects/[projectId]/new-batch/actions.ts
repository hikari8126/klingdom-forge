"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { enqueueJobs } from "@/lib/queue";

export type ComposerImage = { name: string; dataBase64: string };
export type ComposerSettings = {
  prompt: string;
  duration: "5" | "10";
  mode: "std" | "pro";
};

/** One image → one image2video job, all sharing the batch settings. */
export async function createImage2VideoBatchAction(
  workspaceId: string,
  projectId: string,
  settings: ComposerSettings,
  images: ComposerImage[],
) {
  const actor = await requireUser();
  if (images.length === 0) throw new Error("Chọn ít nhất 1 ảnh");
  const paramsList = images.map((img) => ({
    image: img.dataBase64,
    prompt: settings.prompt || undefined,
    duration: settings.duration,
    mode: settings.mode,
  }));
  await enqueueJobs(actor, projectId, "image2video", "folder", paramsList);
  redirect(`/workspaces/${workspaceId}/projects/${projectId}`);
}
